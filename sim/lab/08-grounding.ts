// Lesson 8: hallucination and grounding.
// Run with: npm run lab:08
//
// The model is trained to produce plausible text, not true text. Asked about facts it cannot know,
// it invents a confident answer. We compare three prompts for the same questions:
//   A. No facts.                       -> expect fabricated answers
//   B. Facts pasted into the prompt.   -> expect correct answers (this is "grounding")
//   C. Facts + permission to say "I don't know". -> expect honesty on the question the facts do not cover
import { config } from "../config";

type ChatResponse = { message: { content: string } };

// The world's ground truth. In the simulation this comes from world state and the NPC's memory, never from the model.
const facts = [
  "Bread costs 3 coins a loaf at John's bakery.",
  "The mayor of LLM City is Bogdan Bo.",
  "The smithy closes at 6 PM every day.",
];

const questions = [
  "How much does a loaf of bread cost at John's bakery?", // covered by facts
  "Who is the mayor of LLM City?", // covered by facts
  "What is the name of the blacksmith's brother?", // NOT covered by facts
];

async function chat(system: string, question: string): Promise<string> {
  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.chatModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: question },
      ],
      stream: false,
      options: { temperature: 0, num_predict: 60 },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return ((await res.json()) as ChatResponse).message.content.trim().replace(/\s+/g, " ");
}

async function main() {
  const base = "You are a helpful guide to the town of LLM City. Answer in one short sentence.";
  const factBlock = `Facts about the town:\n${facts.map((f) => `- ${f}`).join("\n")}`;

  const variants = [
    { label: "A. No facts", system: base },
    { label: "B. Facts in the prompt", system: `${base}\n\n${factBlock}` },
    {
      label: "C. Facts + 'say I don't know'",
      system: `${base}\n\n${factBlock}\n\nAnswer ONLY from the facts above. If the facts do not contain the answer, reply exactly: I don't know.`,
    },
  ];

  for (const q of questions) {
    console.log(`\n### Question: ${q}`);
    for (const v of variants) {
      console.log(`  ${v.label.padEnd(30)} -> ${await chat(v.system, q)}`);
    }
  }

  console.log("\nTakeaways:");
  console.log("  - In A the model answers with confidence about a town that does not exist outside our code. That is hallucination.");
  console.log("  - In B the right answers appear because the facts are in front of the model. Here it also declined the brother question, but nothing guarantees that.");
  console.log("  - In C the instruction to admit ignorance helps, but it is not a guarantee. Small models still slip sometimes.");
  console.log("  - Design rule for the simulation: world facts (prices, who owns what, who is where) live in code and memory.");
  console.log("    The model supplies personality and wording. It never serves as the source of truth.");
}

main();
