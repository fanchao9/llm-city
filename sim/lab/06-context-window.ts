// Lesson 6: the context window is the maximum number of tokens (prompt + answer) the model can see.
// Run with: npm run lab:06
//
// We hide a secret code at the START of a long prompt, pad the prompt with town gossip, and ask for the code at the END.
// When the prompt exceeds `num_ctx`, Ollama silently drops the oldest tokens, so the code vanishes and the model guesses.
// Watch `prompt_eval_count`: it stops growing even though we keep sending more text. With num_ctx 2048 it plateaus
// near 1026 (about half the window, because Ollama keeps room to generate), not at 2048.
import { config } from "../config";

type ChatResponse = { message: { content: string }; prompt_eval_count: number; total_duration: number };

const SECRET = "BLUE-HERON-4471";

// Small seeded random generator so every run builds the same padding text.
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const names = ["Alice", "Bob", "Carl", "Dave", "Emily", "Fred", "George", "Ilya", "James", "Kevin"];
const things = ["a cart wheel", "three eggs", "a cracked lantern", "some wool", "a loaf of rye", "a broken gate", "a sack of flour", "an old map"];
const places = ["the bakery", "the park", "the tavern", "the smithy", "the well", "the mill", "the bridge"];

function gossip(lines: number): string {
  const rng = makeRng(42);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
  const out: string[] = [];
  for (let i = 0; i < lines; i++) {
    out.push(`${pick(names)} saw ${pick(names)} carrying ${pick(things)} near ${pick(places)} and said it was nobody's business.`);
  }
  return out.join("\n");
}

async function ask(gossipLines: number, numCtx: number) {
  const prompt =
    `Remember this: the secret code is ${SECRET}.\n\n` +
    `Here is town gossip, which is not important:\n${gossip(gossipLines)}\n\n` +
    "Question: what is the secret code? Reply with only the code.";

  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.chatModel,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      options: { temperature: 0, num_predict: 30, num_ctx: numCtx },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as ChatResponse;
  const answer = data.message.content.trim().replace(/\s+/g, " ");
  return {
    promptChars: prompt.length,
    promptTokens: data.prompt_eval_count,
    seconds: data.total_duration / 1e9,
    answer,
    found: answer.includes(SECRET),
  };
}

async function run(label: string, numCtx: number, sizes: number[]) {
  console.log(`\n=== ${label} (num_ctx = ${numCtx}) ===`);
  console.log("gossip lines | chars  | prompt tokens | time   | found? | answer");
  for (const lines of sizes) {
    const r = await ask(lines, numCtx);
    console.log(
      `${String(lines).padStart(12)} | ${String(r.promptChars).padStart(6)} | ${String(r.promptTokens).padStart(13)} | ${r.seconds
        .toFixed(1)
        .padStart(4)} s | ${r.found ? "yes   " : "NO    "} | ${r.answer.slice(0, 50)}`,
    );
  }
}

async function main() {
  // Each gossip line is about 25 tokens, so 400 lines is roughly 10,000 tokens.
  const sizes = [5, 50, 100, 200, 400];

  await run("Small window", 2048, sizes);
  await run("Bigger window", 8192, sizes);

  console.log("\nTakeaways:");
  console.log("  - With a small window, 'prompt tokens' plateaus (about half of num_ctx). The start of the prompt was cut off, and the answer is a guess.");
  console.log("  - A bigger window keeps more, but costs VRAM and slows every call (compare the time column).");
  console.log("  - The truncation is silent. No error. Our client must count tokens and keep prompts well under the limit.");
  console.log("  - For NPCs: a small, well-chosen prompt beats a huge one. Retrieval (lesson 7) picks what goes in.");
}

main();
