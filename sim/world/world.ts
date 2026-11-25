import type { InitMessage, StateMessage } from "../protocol";
import { SPEEDS } from "../protocol";
import { timeAtTick } from "./clock";
import { Agent, AGENT_SPECS } from "./agents";
import { TownMap } from "./map";

export class World {
  readonly map = new TownMap();
  readonly agents: Agent[];
  tick = 0;

  constructor() {
    this.agents = AGENT_SPECS.map((spec) => new Agent(spec, this.map));
  }

  step(): void {
    this.tick++;
    const { minuteOfDay } = timeAtTick(this.tick);
    for (const agent of this.agents) agent.update(minuteOfDay);
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
      agents: this.agents.map((a) => a.state()),
    };
  }
}
