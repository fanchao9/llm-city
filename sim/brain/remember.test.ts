// Uses a fake LLM, so Ollama isn't needed.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatRequest, ChatResult, LlmClient } from "../llm/client";
import { MemoryStore } from "../world/memory";
import { DEFAULT_IMPORTANCE, rateImportance, remember } from "./remember";

// Answers chat requests with each reply in turn (repeating the last), and embeds with a fixed vector.
// Either call can be told to throw, to exercise the failure paths.
class FakeClient implements LlmClient {
  readonly model = "fake";
  chatCalls = 0;
  embedCalls = 0;

  constructor(
    private readonly chatAnswers: (string | Error)[],
    private readonly embedAnswer: number[][] | Error = [[0.1, 0.2, 0.3]],
  ) {}

  async chat(_request: ChatRequest): Promise<ChatResult> {
    const answer = this.chatAnswers[Math.min(this.chatCalls, this.chatAnswers.length - 1)];
    this.chatCalls++;
    if (answer instanceof Error) throw answer;
    return { content: answer, durationMs: 1, promptTokens: 1, completionTokens: 1 };
  }

  async embed(_texts: string[]): Promise<number[][]> {
    this.embedCalls++;
    if (this.embedAnswer instanceof Error) throw this.embedAnswer;
    return this.embedAnswer;
  }
}

const rating = (n: number) => JSON.stringify({ importance: n });

describe("rateImportance", () => {
  it("returns the model's number when it is valid", async () => {
    const client = new FakeClient([rating(8)]);
    assert.equal(await rateImportance(client, "Dorrik confessed he is in debt"), 8);
  });

  it("falls back to the default when the model gives junk", async () => {
    const client = new FakeClient(["not a number at all"]);
    assert.equal(await rateImportance(client, "whatever"), DEFAULT_IMPORTANCE);
  });

  it("falls back when the number is out of range", async () => {
    const client = new FakeClient([rating(99)]);
    assert.equal(await rateImportance(client, "whatever"), DEFAULT_IMPORTANCE);
  });

  it("falls back when the chat call throws", async () => {
    const client = new FakeClient([new Error("ollama down")]);
    assert.equal(await rateImportance(client, "whatever"), DEFAULT_IMPORTANCE);
  });
});

describe("remember", () => {
  it("stores the observation with its rated importance and embedding", async () => {
    const store = new MemoryStore();
    const client = new FakeClient([rating(6)], [[0.4, 0.5]]);

    const memory = await remember(client, store, 90, "opened the bakery");

    assert.equal(store.size, 1);
    assert.equal(memory.text, "opened the bakery");
    assert.equal(memory.tick, 90);
    assert.equal(memory.importance, 6);
    assert.deepEqual(memory.embedding, [0.4, 0.5]);
    assert.equal(client.chatCalls, 1);
    assert.equal(client.embedCalls, 1);
  });

  it("still stores the memory, with a null embedding, when embedding fails", async () => {
    const store = new MemoryStore();
    const client = new FakeClient([rating(5)], new Error("embed down"));

    const memory = await remember(client, store, 0, "a quiet morning");

    assert.equal(store.size, 1);
    assert.equal(memory.importance, 5);
    assert.equal(memory.embedding, null);
  });

  it("uses the default importance when rating fails but still embeds", async () => {
    const store = new MemoryStore();
    const client = new FakeClient([new Error("chat down")], [[0.9]]);

    const memory = await remember(client, store, 0, "something happened");

    assert.equal(memory.importance, DEFAULT_IMPORTANCE);
    assert.deepEqual(memory.embedding, [0.9]);
  });
});
