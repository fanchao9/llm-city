// Lesson 1: what a raw LLM call looks like.
// Run with: npm run lab:01

import { config } from "../config";

type ChatResponse = {
  message: { role: string; content: string };
  done_reason: string;
  prompt_eval_count: number;
  eval_count: number;
  prompt_eval_duration: number;
  eval_duration: number;
  total_duration: number;
};

async function main() {
  // Pass your own prompt: npm run lab:01 -- "Why is the sky blue?"
  const userPrompt = process.argv[2] ?? "Describe a small bakery in a fantasy town in two sentences.";

  const body = {
    model: config.chatModel,
    messages: [{ role: "user", content: userPrompt }],
    stream: false,
  };

  console.log("=== REQUEST BODY (what we send) ===");
  console.log(JSON.stringify(body, null, 2));

  const started = performance.now();
  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as ChatResponse;
  const wallSeconds = (performance.now() - started) / 1000;

  console.log("\n=== MODEL ANSWER ===");
  console.log(data.message.content.trim());

  console.log("\n=== STATS ===");
  console.log(`Why it stopped:        ${data.done_reason} ("stop" = finished naturally, "length" = hit a token limit)`);
  console.log(`Prompt tokens (in):    ${data.prompt_eval_count}`);
  console.log(`Generated tokens (out):${data.eval_count}`);
  console.log(`Generation speed:      ${((data.eval_count / data.eval_duration) * 1e9).toFixed(1)} tokens/s`);
  console.log(`Total time (wall):     ${wallSeconds.toFixed(2)} s`);
  console.log("\nA token is roughly 3/4 of an English word. Cost and speed both scale with tokens.");
}

main();
