import type { InitMessage, StateMessage } from "../protocol";
import { SPEEDS } from "../protocol";
import { timeAtTick } from "./clock";
import { Agent, AGENT_SPECS } from "./agents";
import { TownMap } from "./map";

export type WorldOptions = {
  // Ids of agents that decide with the LLM. Everyone else follows the schedule only.
  thinkingIds?: Iterable<string>;
};

export class World {
  readonly map = new TownMap();
  readonly agents: Agent[];
  readonly thinkingIds: ReadonlySet<string>;
  tick = 0;
  private decisionPoints: string[] = [];

  constructor(options: WorldOptions = {}) {
    this.agents = AGENT_SPECS.map((spec) => new Agent(spec, this.map));
    this.thinkingIds = new Set(options.thinkingIds ?? []);
    for (const id of this.thinkingIds) {
      if (!this.agents.some((a) => a.spec.id === id)) {
        throw new Error(`Unknown thinking agent "${id}". Known agents: ${this.agents.map((a) => a.spec.id).join(", ")}`);
      }
    }
  }

  step(): void {
    this.tick++;
    const { minuteOfDay } = timeAtTick(this.tick);
    for (const agent of this.agents) {
      const arrived = agent.update(minuteOfDay);
      if (arrived && this.thinkingIds.has(agent.spec.id)) this.decisionPoints.push(agent.spec.id);
    }
  }

  takeDecisionPoints(): string[] {
    const points = this.decisionPoints;
    this.decisionPoints = [];
    return points;
  }

  agent(id: string): Agent {
    const agent = this.agents.find((a) => a.spec.id === id);
    if (!agent) throw new Error(`Unknown agent "${id}"`);
    return agent;
  }

  initMessage(): InitMessage {
    return {
      width: this.map.width,
      height: this.map.height,
      rows: this.map.rows,
      locations: this.map.locations,
      speeds: [...SPEEDS],
    };
  }

  stateMessage(control: { running: boolean; speed: number }): StateMessage {
    const time = timeAtTick(this.tick);
    return {
      tick: this.tick,
      day: time.day,
      time: time.text,
      running: control.running,
      speed: control.speed,
      agents: this.agents.map((a) => a.state(this.tick)),
    };
  }
}
