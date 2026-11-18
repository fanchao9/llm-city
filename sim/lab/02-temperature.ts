// Lesson 2: temperature controls how random the model's word choices are.
// Run with: npm run lab:02

import { config } from "../config";

type ChatResponse = { message: { content: string } };

async function ask(prompt: string, temperature: number): Promise<string> {
  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.chatModel,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      options: { temperature, num_predict: 20 },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return ((await res.json()) as ChatResponse).message.content.trim().replace(/\s+/g, " ");
}

async function main() {
  // Pass your own prompt: npm run lab:02 -- "Invent a name for a blacksmith."
  const prompt = process.argv[2] ?? "Invent a name for a baker in a medieval town. Reply with only the name.";
  console.log(`Prompt: ${prompt}`);
  const runs = 5;

  for (const temperature of [0, 1, 1.5]) {
    console.log(`\n=== temperature ${temperature} ===`);
    for (let i = 1; i <= runs; i++) {
      console.log(`  run ${i}: ${await ask(prompt, temperature)}`);
    }
  }

  console.log("\nTemperature 0 should repeat itself (or nearly). Higher values give more variety, and eventually nonsense.");
  console.log("For NPC dialogue we want some variety. For choosing actions we want less.");
}

main();
