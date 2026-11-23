// Lesson 4: getting machine-readable decisions out of the model.
// Run with: npm run lab:04
//
// The simulation cannot act on prose like "I think I'll go to the tavern."
// It needs { action: "move_to", target: "tavern" }. This lesson shows three layers:
//   A. Asking nicely for JSON (unreliable)
//   B. Forcing the shape with a JSON schema in Ollama's `format` field
//   C. Checking the meaning in our own code with Zod, plus retry and a safe fallback

import { z } from "zod";
import { config } from "../config";

const LOCATIONS = ["bakery", "park", "tavern", "smithy", "home"] as const;

// The schema describes what a valid decision looks like.
// Field order matters: the model writes fields in order, so "thought" first lets it reason before it commits to an action.
const DecisionSchema = z
  .object({
    thought: z.string().describe("One short sentence of private reasoning."),
    action: z.enum(["move_to", "speak", "wait"]),
    target: z.enum([...LOCATIONS, "none"]).describe('Where to go. Use "none" unless action is move_to.'),
    say: z.string().describe('What you say out loud. Empty string unless action is speak.'),
  })
  // The JSON schema sent to Ollama cannot express this rule, so Zod checks it after the fact.
  .refine((d) => d.action !== "move_to" || d.target !== "none", {
    message: 'action "move_to" needs a real target location',
  });

type Decision = z.infer<typeof DecisionSchema>;

const system =
  "You are Maren, a warm, chatty baker in the small town of LLM City. You decide what to do next.";

const situation = [
  "It is 7:00 AM. You are at the bakery with 12 loaves of bread.",
  "Dorrik the blacksmith is standing outside, looking tired.",
  `Places you can go: ${LOCATIONS.join(", ")}.`,
  "Memory: yesterday you heard Dorrik is short of money.",
  "What do you do next?",
].join("\n");

type ChatResponse = { message: { content: string } };

async function chat(userPrompt: string, format?: object): Promise<string> {
  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.chatModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      stream: false,
      format, // undefined means "no constraint"
      options: { temperature: 0.7, num_predict: 300 },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return ((await res.json()) as ChatResponse).message.content.trim();
}

function tryParse(text: string): { ok: true; value: Decision } | { ok: false; reason: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not valid JSON" };
  }
  const result = DecisionSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, reason: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") };
  }
  return { ok: true, value: result.data };
}

async function main() {
  const runs = 5;

  // The schema we send to Ollama. Zod generates it for us, so there is one source of truth.
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(DecisionSchema, { io: "input" }) as Record<string, unknown>;
  console.log("=== JSON schema sent in the `format` field ===");
  console.log(JSON.stringify(jsonSchema, null, 2));

  // ---- A: ask nicely ----
  console.log(`\n=== A. Asking for JSON in the prompt only (${runs} runs) ===`);
  const promptWithJsonAsk =
    situation +
    '\n\nReply with JSON only, shaped like: {"thought": string, "action": "move_to"|"speak"|"wait", "target": location or "none", "say": string}';
  let okA = 0;
  for (let i = 1; i <= runs; i++) {
    const raw = await chat(promptWithJsonAsk);
    const parsed = tryParse(raw);
    if (parsed.ok) okA++;
    console.log(`  run ${i}: ${parsed.ok ? "valid" : `INVALID (${parsed.reason})`}`);
    if (i === 1) console.log(`    raw output: ${raw.replace(/\s+/g, " ").slice(0, 200)}`);
  }
  console.log(`  -> ${okA}/${runs} usable`);

  // ---- B: force the shape ----
  console.log(`\n=== B. Same prompt, with the schema in \`format\` (${runs} runs) ===`);
  let okB = 0;
  for (let i = 1; i <= runs; i++) {
    const raw = await chat(promptWithJsonAsk, jsonSchema);
    const parsed = tryParse(raw);
    if (parsed.ok) okB++;
    console.log(`  run ${i}: ${parsed.ok ? "valid" : `INVALID (${parsed.reason})`}`);
    console.log(`    ${raw.replace(/\s+/g, " ")}`);
  }
  console.log(`  -> ${okB}/${runs} usable`);

  // ---- C: retry once, then fall back ----
  console.log("\n=== C. decide(): validate, retry once, then fall back to a safe action ===");
  const decision = await decide(promptWithJsonAsk, jsonSchema);
  console.log(decision);

  console.log("\nTakeaways:");
  console.log("  - The schema forces the SHAPE (field names, allowed values). It cannot check that the content makes sense.");
  console.log("  - Our code checks the MEANING (Zod refine, and later: does that location exist, does the NPC own that item).");
  console.log("  - Never let the model's output act on the world directly. Validate, then execute.");
}

async function decide(prompt: string, jsonSchema: object): Promise<Decision & { source: string }> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const parsed = tryParse(await chat(prompt, jsonSchema));
    if (parsed.ok) return { ...parsed.value, source: `llm (attempt ${attempt})` };
    console.log(`  attempt ${attempt} failed: ${parsed.reason}`);
  }
  return { thought: "fallback", action: "wait", target: "none", say: "", source: "fallback" };
}

main();
