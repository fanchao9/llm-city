// Uses a fake LLM, so Ollama isn't needed.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatRequest, ChatResult, LlmClient } from "../llm/client";
import { chatJson, SerialQueue } from "../llm/client";
import type { CallRecord } from "../protocol";
import { World } from "../world/world";
import { Brain, decisionSchema, FALLBACK_DECISION, normalize } from "./brain";
import { buildPrompt } from "./prompt";

// Replies with each answer in turn, then repeats the last one.
class FakeClient implements LlmClient {
  readonly model = "fake";
  requests: ChatRequest[] = [];
  constructor(private readonly answers: (string | Error)[]) {}

  async chat(request: ChatRequest): Promise<ChatResult> {
    const answer = this.answers[Math.min(this.requests.length, this.answers.length - 1)];
    this.requests.push(request);
    if (answer instanceof Error) throw answer;
    return { content: answer, durationMs: 5, promptTokens: 10, completionTokens: 5 };
  }
  async embed(): Promise<number[][]> {
    return [];
  }
}

const decision = (d: object) =>
  JSON.stringify({ thought: "t", action: "continue", target: "none", say: "", ...d });

function runToDecisionPoint(world: World, brain: Brain): void {
  for (let i = 0; i < 24 * 60 && !brain.busy; i++) {
    world.step();
    brain.afterStep();
  }
  assert.ok(brain.busy, "expected a decision point within a day");
}

async function settle(brain: Brain) {
  for (let i = 0; i < 50 && brain.busy; i++) await new Promise((r) => setTimeout(r, 1));
  assert.equal(brain.busy, false, "brain never finished");
}

function setup(answers: (string | Error)[], thinkingIds = ["maren"]) {
  const world = new World({ thinkingIds });
  const records: CallRecord[] = [];
  const client = new FakeClient(answers);
  const brain = new Brain(world, client, (r) => records.push(r), () => {});
  return { world, brain, client, records };
}

describe("prompt", () => {
  it("states facts from the world and offers only valid places", () => {
    const world = new World({ thinkingIds: ["maren"] });
    for (let i = 0; i < 3 * 60; i++) world.step();
    const prompt = buildPrompt(world, "maren");
    assert.match(prompt.system, /You are Maren, the baker/);
    assert.match(prompt.user, /You are at Bakery/);
    assert.match(prompt.user, /at 12:00 you go to Tavern/);
    assert.ok(!prompt.targets.includes("bakery"), "current place is not an option");
    assert.ok(prompt.targets.includes("home_maren"));
    assert.ok(!prompt.targets.includes("home_dorrik"), "other people's homes are not an option");
  });

  it("lists who is standing here", () => {
    const world = new World({ thinkingIds: ["maren"] });
    const dorrik = world.agent("dorrik");
    const maren = world.agent("maren");
    dorrik.x = maren.x;
    dorrik.y = maren.y;
    assert.match(buildPrompt(world, "maren").user, /Here with you: Dorrik/);
  });
});

describe("decision schema", () => {
  const schema = decisionSchema(["park", "tavern"]);

  it("accepts valid decisions", () => {
    assert.ok(schema.safeParse(JSON.parse(decision({}))).success);
    assert.ok(schema.safeParse(JSON.parse(decision({ action: "move_to", target: "park" }))).success);
    assert.ok(schema.safeParse(JSON.parse(decision({ action: "speak", say: "Hello!" }))).success);
  });

  it("rejects places that are not on the menu", () => {
    assert.equal(schema.safeParse(JSON.parse(decision({ action: "move_to", target: "moon" }))).success, false);
  });

  it("rejects move_to without a target and speak without words", () => {
    assert.equal(schema.safeParse(JSON.parse(decision({ action: "move_to" }))).success, false);
    assert.equal(schema.safeParse(JSON.parse(decision({ action: "speak", say: "  " }))).success, false);
  });

  it("normalize drops fields that do not belong to the action", () => {
    const d = normalize({ thought: "t", action: "continue", target: "park", say: "hi" });
    assert.equal(d.target, "none");
    assert.equal(d.say, "");
  });
});

describe("chatJson", () => {
  const schema = decisionSchema(["park"]);
  const request = { messages: [{ role: "user" as const, content: "hi" }] };

  it("retries once after invalid output and then succeeds", async () => {
    const client = new FakeClient(["not json", decision({})]);
    const result = await chatJson(client, schema, request);
    assert.equal(result.ok, true);
    assert.equal(result.attempts.length, 2);
    assert.equal(result.attempts[0].error, "not valid JSON");
    assert.equal(result.attempts[1].error, null);
  });

  it("gives up after two bad answers without throwing", async () => {
    const client = new FakeClient([decision({ action: "move_to", target: "moon" })]);
    const result = await chatJson(client, schema, request);
    assert.equal(result.ok, false);
    assert.equal(result.attempts.length, 2);
  });

  it("records a network error as a failed attempt", async () => {
    const client = new FakeClient([new Error("connect ECONNREFUSED")]);
    const result = await chatJson(client, schema, request);
    assert.equal(result.ok, false);
    assert.match(result.attempts[0].error ?? "", /ECONNREFUSED/);
  });

  it("sends the JSON schema as the format", async () => {
    const client = new FakeClient([decision({})]);
    await chatJson(client, schema, request);
    const format = client.requests[0].format as { properties: Record<string, unknown> };
    assert.deepEqual(Object.keys(format.properties), ["thought", "action", "target", "say"]);
  });
});

describe("SerialQueue", () => {
  it("runs tasks one at a time, in order, even after a failure", async () => {
    const queue = new SerialQueue();
    const log: string[] = [];
    const task = (name: string, ms: number, fail = false) => async () => {
      log.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`end ${name}`);
      if (fail) throw new Error(name);
      return name;
    };
    const results = await Promise.allSettled([
      queue.add(task("a", 10, true)),
      queue.add(task("b", 1)),
      queue.add(task("c", 1)),
    ]);
    assert.deepEqual(log, ["start a", "end a", "start b", "end b", "start c", "end c"]);
    assert.deepEqual(results.map((r) => r.status), ["rejected", "fulfilled", "fulfilled"]);
  });
});

describe("brain", () => {
  it("only asks about thinking agents, when they arrive at a scheduled place", () => {
    const { world, brain, client } = setup([decision({})]);
    runToDecisionPoint(world, brain);
    assert.equal(client.requests.length, 1);
    assert.equal(world.agent("maren").thinking, true);
    assert.equal(world.agent("dorrik").thinking, false);
    assert.equal(world.agent("maren").walking, false, "she has arrived");
  });

  it("never asks when nobody is allowed to think", () => {
    const world = new World();
    for (let i = 0; i < 24 * 60; i++) world.step();
    assert.deepEqual(world.takeDecisionPoints(), []);
  });

  it("asks again at the next scheduled arrival, not for every step", async () => {
    const { world, brain, client } = setup([decision({})]);
    for (let i = 0; i < 24 * 60; i++) {
      world.step();
      brain.afterStep();
      await settle(brain);
    }
    // Maren has 6 scheduled moves after the start.
    assert.equal(client.requests.length, 6);
  });

  it("move_to sends the agent elsewhere until the schedule changes", async () => {
    const { world, brain, records } = setup([decision({ action: "move_to", target: "park" })]);
    runToDecisionPoint(world, brain);
    await settle(brain);
    const maren = world.agent("maren");
    assert.equal(records.length, 1);
    assert.equal(records[0].source, "llm");
    assert.match(records[0].outcome, /Heads to Park/);

    while (world.stateMessage({ running: false, speed: 1 }).time !== "11:59") {
      world.step();
      brain.afterStep();
    }
    const park = world.map.location("park");
    assert.deepEqual({ x: maren.x, y: maren.y }, { x: park.x, y: park.y });
    assert.equal(world.takeDecisionPoints().length, 0, "arriving at a chosen place is not a decision point");

    for (let i = 0; i < 60; i++) world.step();
    const tavern = world.map.location("tavern");
    assert.deepEqual({ x: maren.x, y: maren.y }, { x: tavern.x, y: tavern.y });
  });

  it("speak shows a speech bubble that fades", async () => {
    const { world, brain } = setup([decision({ action: "speak", say: "Fresh bread!" })]);
    runToDecisionPoint(world, brain);
    await settle(brain);
    const maren = world.agent("maren");
    assert.equal(maren.state(world.tick).say, "Fresh bread!");
    assert.equal(maren.state(world.tick + 1000).say, null);
  });

  it("falls back to the routine when the model keeps failing", async () => {
    const { world, brain, records } = setup(["garbage"]);
    runToDecisionPoint(world, brain);
    await settle(brain);
    assert.equal(records[0].source, "fallback");
    assert.deepEqual(records[0].decision, FALLBACK_DECISION);
    assert.equal(records[0].attempts.length, 2);
    assert.equal(world.agent("maren").thinking, false);
  });

  it("records exactly what was sent to the model", async () => {
    const { world, brain, client, records } = setup([decision({})]);
    runToDecisionPoint(world, brain);
    await settle(brain);
    assert.equal(records[0].system, client.requests[0].messages[0].content);
    assert.equal(records[0].user, client.requests[0].messages[1].content);
    assert.equal(records[0].model, "fake");
  });

  it("ignores answers that arrive after dispose", async () => {
    const { world, brain, records } = setup([decision({ action: "speak", say: "late" })]);
    runToDecisionPoint(world, brain);
    brain.dispose();
    await settle(brain);
    assert.equal(records.length, 0);
    assert.equal(world.agent("maren").state(world.tick).say, null);
  });

  it("rejects unknown thinking agents", () => {
    assert.throws(() => new World({ thinkingIds: ["nobody"] }), /Unknown thinking agent/);
  });
});
