// Lesson 3: the system prompt gives the model a role. The same question, three different NPCs.
// Run with: npm run lab:03

import { config } from "../config";

type ChatResponse = { message: { content: string } };
type Message = { role: "system" | "user"; content: string };

const personas: { name: string; system: string | null }[] = [
  { name: "(no system prompt)", system: null },
  {
    name: "Maren, baker",
    system:
      "You are Maren, a warm, chatty baker in the small town of LLM City. You love gossip and always have an opinion. " +
      "Stay in character. Reply in one or two short spoken sentences.",
  },
  {
    name: "Dorrik, blacksmith",
    system:
      "You are Dorrik, a gruff, suspicious blacksmith in the small town of LLM City. You distrust outsiders and speak bluntly with few words. " +
      "Stay in character. Reply in one or two short spoken sentences.",
  },
  {
    name: "Ilsa, herbalist",
    system:
      "You are Ilsa, a nervous, superstitious herbalist in the small town of LLM City. You read omens into everything. " +
      "Stay in character. Reply in one or two short spoken sentences.",
  },
];

async function chat(messages: Message[], temperature: number): Promise<string> {
  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.chatModel,
      messages,
      stream: false,
      options: { temperature, num_predict: 100 },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return ((await res.json()) as ChatResponse).message.content.trim();
}

async function main() {
  const situation =
    process.argv[2] ?? "A stranger in a dark cloak just walked into town carrying a large locked chest. What do you say to your neighbor?";
  console.log(`Situation: ${situation}`);

  for (const persona of personas) {
    const messages: Message[] = [];
    if (persona.system) messages.push({ role: "system", content: persona.system });
    messages.push({ role: "user", content: situation });

    console.log(`\n=== ${persona.name} ===`);
    if (persona.system) console.log(`[system prompt] ${persona.system}`);
    console.log(`> ${await chat(messages, 0.8)}`);
  }

  console.log("\nThe system prompt is where an NPC's personality lives. Every call we make for an NPC will start with one.");
}

main();
