// Lesson 5: the model has no memory. Our code supplies it by resending the conversation.
// Run with: npm run lab:05
//
// Three calls with the same model:
//   1. Tell the NPC a fact.
//   2. Ask about the fact in a NEW request that does not include call 1. It cannot know.
//   3. Ask again, this time resending the earlier messages. Now it can answer.
// This is the whole idea behind an NPC "memory": stored text that we paste back into the prompt.
import { config } from "../config";

type Message = { role: "system" | "user" | "assistant"; content: string };
type ChatResponse = { message: { content: string }; prompt_eval_count: number };

async function chat(messages: Message[]): Promise<{ text: string; promptTokens: number }> {
  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.chatModel,
      messages,
      stream: false,
      options: { temperature: 0, num_predict: 80 },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as ChatResponse;
  return { text: data.message.content.trim(), promptTokens: data.prompt_eval_count };
}

function show(label: string, messages: Message[], reply: { text: string; promptTokens: number }) {
  console.log(`\n=== ${label} ===`);
  console.log(`Messages sent: ${messages.length}   Prompt tokens: ${reply.promptTokens}`);
  for (const m of messages) console.log(`  [${m.role}] ${m.content}`);
  console.log(`  -> reply: ${reply.text}`);
}

async function main() {
  const system: Message = {
    role: "system",
    content: "You are John, a friendly baker in the town of LLM City. Reply in one short sentence.",
  };

  // Call 1: tell Maren something.
  const tell: Message = { role: "user", content: "Hi John! My name is Bob and I just moved here from the coast." };
  const call1 = [system, tell];
  const reply1 = await chat(call1);
  show("Call 1: introduce yourself", call1, reply1);

  // Call 2: a fresh request. Nothing from call 1 is included, so nothing is remembered.
  const ask: Message = { role: "user", content: "Do you remember my name and where I moved from?" };
  const call2 = [system, ask];
  const reply2 = await chat(call2);
  show("Call 2: ask WITHOUT resending call 1", call2, reply2);

  // Call 3: resend the earlier turns. The model "remembers" because the text is in front of it.
  const call3 = [system, tell, { role: "assistant", content: reply1.text } as Message, ask];
  const reply3 = await chat(call3);
  show("Call 3: ask WITH call 1 resent as history", call3, reply3);

  console.log("\nTakeaways:");
  console.log("  - Each request stands alone. Call 2 had no way to know Bob's name.");
  console.log("  - 'Memory' is our code storing text and pasting it back. Call 3 sent more tokens, so it cost more.");
  console.log("  - History grows every turn, but the context window is finite (lesson 6). That is why the simulation");
  console.log("    will retrieve only the RELEVANT memories instead of resending everything.");
}

main();
