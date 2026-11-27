// Asks the LLM what a thinking agent should do at a decision point, checks the answer, and applies it.
// The server pauses the clock while `busy` is true, so the world doesn't move on while we wait.
// If the model can't give a valid answer in two tries, the agent just follows its schedule.
import { z } from "zod";
import { DECISION_ACTIONS } from "../protocol";
import type { AgentDecision, CallRecord } from "../protocol";
import { chatJson, toFormat } from "../llm/client";
import type { LlmClient } from "../llm/client";
import { timeAtTick } from "../world/clock";
import type { World } from "../world/world";
import { buildPrompt } from "./prompt";

export const MAX_SAY_LENGTH = 200;

// Built per call, because where the agent can go depends on where it is now.
export function decisionSchema(targets: string[]) {
  return z
    .object({
      // "thought" comes first so the model reasons before it picks an action.
      thought: z.string().describe("One short sentence of private reasoning."),
      action: z.enum(DECISION_ACTIONS),
      target: z.enum(["none", ...targets] as [string, ...string[]]).describe('Where to go. Use "none" unless action is move_to.'),
      say: z.string().max(MAX_SAY_LENGTH).describe("What you say out loud. Empty string unless action is speak."),
    })
    // Rules the JSON schema can't express.
    .refine((d) => d.action !== "move_to" || d.target !== "none", {
      message: 'action "move_to" needs a real target place',
    })
    .refine((d) => d.action !== "speak" || d.say.trim().length > 0, {
      message: 'action "speak" needs something to say',
    });
}

// Clear the fields the chosen action doesn't use.
export function normalize(decision: AgentDecision): AgentDecision {
  return {
    thought: decision.thought,
    action: decision.action,
    target: decision.action === "move_to" ? decision.target : "none",
    say: decision.action === "speak" ? decision.say.trim() : "",
  };
}

export const FALLBACK_DECISION: AgentDecision = {
  thought: "(no valid answer from the model)",
  action: "continue",
  target: "none",
  say: "",
};

export class Brain {
  private pending = 0;
  private disposed = false;
  private nextCallId = 1;

  constructor(
    private readonly world: World,
    private readonly client: LlmClient,
    // Called when a decision finishes.
    private readonly onCall: (record: CallRecord) => void,
    // Called when agent state changes outside a step (a decision was applied).
    private readonly onChange: () => void,
  ) {}

  // True while we're waiting on the model. Don't advance the clock.
  get busy(): boolean {
    return this.pending > 0;
  }

  // Call after every world.step().
  afterStep(): void {
    for (const id of this.world.takeDecisionPoints()) void this.think(id);
  }

  // Drop answers still in flight, e.g. after a reset.
  dispose(): void {
    this.disposed = true;
  }

  private async think(agentId: string): Promise<void> {
    const agent = this.world.agent(agentId);
    agent.thinking = true;
    this.pending++;
    try {
      const started = performance.now();
      const time = timeAtTick(this.world.tick);
      const prompt = buildPrompt(this.world, agentId);
      const schema = decisionSchema(prompt.targets);

      const result = await chatJson(this.client, schema, {
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        temperature: 0.7,
        maxTokens: 300,
      });
      if (this.disposed) return;

      const source = result.ok ? "llm" : "fallback";
      const decision = result.ok ? normalize(result.value) : FALLBACK_DECISION;
      agent.applyDecision(decision, this.world.tick);

      if (!result.ok) {
        const reason = result.attempts.at(-1)?.error ?? "unknown error";
        console.warn(`[brain] ${agent.spec.name}: no valid decision (${reason}). Carrying on with the routine.`);
      }

      this.onCall({
        id: this.nextCallId++,
        agentId,
        agentName: agent.spec.name,
        day: time.day,
        time: time.text,
        model: this.client.model,
        system: prompt.system,
        user: prompt.user,
        schema: toFormat(schema),
        attempts: result.attempts,
        source,
        decision,
        outcome: this.describeOutcome(decision, source, result.attempts.at(-1)?.error ?? null),
        durationMs: Math.round(performance.now() - started),
      });
    } catch (e) {
      console.error(`[brain] decision for ${agentId} crashed:`, e);
    } finally {
      this.pending--;
      agent.thinking = false;
      if (!this.disposed) this.onChange();
    }
  }

  private describeOutcome(decision: AgentDecision, source: "llm" | "fallback", lastError: string | null): string {
    if (source === "fallback") return `Fallback, carries on with routine (${lastError ?? "no answer"})`;
    switch (decision.action) {
      case "move_to":
        return `Heads to ${this.world.map.location(decision.target).name}`;
      case "speak":
        return `Says: "${decision.say}"`;
      default:
        return "Stays and carries on";
    }
  }
}
