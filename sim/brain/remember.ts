// Records an observation into an agent's memory stream, asking the LLM to rate how important it is and
// to embed it for later relevance search. Both calls go through the shared queue in the client.
// Nothing here throws: a memory we fail to score or embed is still worth keeping, so we store it with
// a default importance and/or a null embedding and move on.
import { z } from "zod";
import { chatJson } from "../llm/client";
import type { LlmClient } from "../llm/client";
import type { Memory, MemoryStore } from "../world/memory";

// Used when the model won't give a usable rating. Mid-low, so an unrated memory doesn't crowd out real ones.
export const DEFAULT_IMPORTANCE = 3;

const ratingSchema = z.object({
  importance: z.number().int().min(1).max(10),
});

function ratingPrompt(text: string) {
  return {
    system:
      "You rate how important a memory is to the person who had it, on a scale of 1 to 10. " +
      "1 is routine and forgettable (brushing teeth, a quiet walk). 10 is life-changing (a death, a betrayal, a wedding). " +
      "Most memories are a 2 or 3. Reply with JSON only.",
    user: `Memory: "${text}"\nHow important is it, 1 to 10?`,
  };
}

// Rate one observation. Returns DEFAULT_IMPORTANCE if the model can't produce a valid number.
export async function rateImportance(client: Pick<LlmClient, "chat">, text: string): Promise<number> {
  const { system, user } = ratingPrompt(text);
  const result = await chatJson(client, ratingSchema, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0,
    maxTokens: 20,
  });
  return result.ok ? result.value.importance : DEFAULT_IMPORTANCE;
}

// Rate and embed an observation, then append it to the store. Never throws.
export async function remember(client: LlmClient, store: MemoryStore, tick: number, text: string): Promise<Memory> {
  const importance = await rateImportance(client, text);

  let embedding: number[] | null = null;
  try {
    [embedding] = await client.embed([text]);
  } catch (e) {
    console.warn(`[memory] could not embed "${text.slice(0, 40)}...": ${e instanceof Error ? e.message : String(e)}`);
  }

  return store.add({ tick, text, importance, embedding });
}
