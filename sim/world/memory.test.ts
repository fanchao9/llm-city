// Run with: npm run test:sim
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MINUTES_PER_DAY, START_MINUTE } from "./clock";
import { MemoryStore } from "./memory";

describe("MemoryStore", () => {
  it("starts empty", () => {
    const store = new MemoryStore();
    assert.equal(store.size, 0);
    assert.deepEqual(store.all(), []);
  });

  it("appends memories oldest first with stable increasing ids", () => {
    const store = new MemoryStore();
    store.add({ tick: 0, text: "woke up" });
    store.add({ tick: 1, text: "smelled bread" });
    store.add({ tick: 2, text: "opened the bakery" });

    const all = store.all();
    assert.equal(store.size, 3);
    assert.deepEqual(
      all.map((m) => m.id),
      [1, 2, 3],
    );
    assert.deepEqual(
      all.map((m) => m.text),
      ["woke up", "smelled bread", "opened the bakery"],
    );
  });

  it("derives day and time from the tick", () => {
    const store = new MemoryStore();
    // The world starts at START_MINUTE on day 1, so tick 0 is that moment.
    const first = store.add({ tick: 0, text: "start" });
    assert.equal(first.day, 1);
    assert.equal(first.time, "05:00");

    const nextDay = store.add({ tick: MINUTES_PER_DAY, text: "a day later" });
    assert.equal(nextDay.day, 2);
    assert.equal(nextDay.time, "05:00");

    const later = store.add({ tick: 90, text: "mid-morning" });
    assert.equal(later.time, "06:30");
    assert.equal(START_MINUTE, 5 * 60); // guards the assumption above
  });

  it("leaves importance and embedding unset until filled in", () => {
    const store = new MemoryStore();
    const memory = store.add({ tick: 0, text: "unrated" });
    assert.equal(memory.importance, null);
    assert.equal(memory.embedding, null);
  });

  it("keeps importance and embedding when supplied", () => {
    const store = new MemoryStore();
    const memory = store.add({ tick: 0, text: "rated", importance: 7, embedding: [0.1, 0.2] });
    assert.equal(memory.importance, 7);
    assert.deepEqual(memory.embedding, [0.1, 0.2]);
  });

  it("returns a copy from all(), so callers cannot mutate the stream", () => {
    const store = new MemoryStore();
    store.add({ tick: 0, text: "only one" });

    const snapshot = store.all();
    snapshot.pop(); // mutate the copy
    assert.equal(store.size, 1);
    assert.equal(store.all().length, 1);
  });
});
