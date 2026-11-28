// An agent's memory stream: an append-only list of natural-language observations, each stamped with game time.
// This is the raw store only. Importance rating and embeddings are added later (they need the LLM), and
// retrieval scoring lives elsewhere. Nothing here is ever edited or removed.
import { timeAtTick } from "./clock";

export type Memory = {
  id: number;
  tick: number; // source of truth for recency; day and time are derived from it
  day: number;
  time: string;
  text: string;
  // Filled in later by the LLM/embedder. null means "not rated / not embedded yet".
  importance: number | null;
  embedding: number[] | null;
};

// What the caller supplies when recording a memory. Everything else is derived or filled in later.
export type NewMemory = {
  tick: number;
  text: string;
  importance?: number | null;
  embedding?: number[] | null;
};

export class MemoryStore {
  private readonly memories: Memory[] = [];
  private nextId = 1;

  // Record one observation and return the stored memory.
  add(entry: NewMemory): Memory {
    const { day, text: time } = timeAtTick(entry.tick);
    const memory: Memory = {
      id: this.nextId++,
      tick: entry.tick,
      day,
      time,
      text: entry.text,
      importance: entry.importance ?? null,
      embedding: entry.embedding ?? null,
    };
    this.memories.push(memory);
    return memory;
  }

  // All memories, oldest first. A copy, so callers can't mutate the stream.
  all(): Memory[] {
    return [...this.memories];
  }

  get size(): number {
    return this.memories.length;
  }
}
