// Lesson 7: embeddings turn text into a list of numbers so we can measure similarity of MEANING.
// Run with: npm run lab:07
// Or with your own query: npm run lab:07 -- "Who might be hungry?"
//
// This is the "relevance" part of memory retrieval: given the NPC's current situation, find the stored memories that matter.
import { config } from "../config";

type EmbedResponse = { embeddings: number[][] };

async function embed(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${config.ollamaUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.embedModel, input: texts }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return ((await res.json()) as EmbedResponse).embeddings;
}

// Cosine similarity: 1 = same direction (similar meaning), 0 = unrelated, negative = opposite.
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const memories = [
  "Dorrik complained that he cannot afford coal for the forge this winter.",
  "Maren baked twelve loaves of rye bread this morning.",
  "A stranger in a black cloak arrived carrying a locked chest.",
  "Ilsa saw a crow land on the well, which she took as a bad omen.",
  "The tavern is hosting a music night on Friday.",
  "Tobias moved here from the coast and is looking for work.",
];

const queries = [
  "Who is short of money?", // shares no words with memory 1, but means the same thing
  "Who might be suspicious or dangerous?",
  "Where can I go to have fun this week?",
  "Who is superstitious?",
];

async function main() {
  const customQuery = process.argv[2];
  const allQueries = customQuery ? [customQuery] : queries;

  // nomic-embed-text was trained with task prefixes. They improve quality a little.
  const docVectors = await embed(memories.map((m) => `search_document: ${m}`));
  const queryVectors = await embed(allQueries.map((q) => `search_query: ${q}`));

  console.log(`Embedding model: ${config.embedModel}`);
  console.log(`Each text becomes a vector of ${docVectors[0].length} numbers.`);
  console.log(`First 6 numbers of memory 1: [${docVectors[0].slice(0, 6).map((n) => n.toFixed(3)).join(", ")}, ...]`);
  console.log("\nMemories:");
  memories.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));

  for (let q = 0; q < allQueries.length; q++) {
    const ranked = memories
      .map((text, i) => ({ text, n: i + 1, score: cosine(queryVectors[q], docVectors[i]) }))
      .sort((a, b) => b.score - a.score);

    console.log(`\n=== Query: "${allQueries[q]}" ===`);
    for (const r of ranked) {
      const bar = "#".repeat(Math.max(0, Math.round(r.score * 40)));
      console.log(`  ${r.score.toFixed(3)} ${bar.padEnd(40)} memory ${r.n}`);
    }
    console.log(`  Top match: ${ranked[0].text}`);
  }

  console.log("\nTakeaways:");
  console.log("  - Matching is by meaning, not shared words. 'short of money' finds 'cannot afford coal'.");
  console.log("  - Scores are relative. Rank them and take the top N. Do not treat a fixed number as 'relevant'.");
  console.log("  - Margins can be thin and the top hit can be debatable ('suspicious' may rank the crow omen above the stranger). Retrieval is approximate.");
  console.log("  - Phase 4 combines this relevance score with recency and importance to pick which memories enter the prompt.");
  console.log("  - Embeddings are cheap and fast compared to chat. We will compute each memory's vector once and store it.");
}

main();
