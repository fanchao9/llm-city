// NPCs. Their default behaviour is a fixed daily schedule.
// An agent that is allowed to think can override the schedule at decision points (see sim/brain).
import type { AgentDecision, AgentState } from "../protocol";
import { parseMinute } from "./clock";
import { findPath } from "./pathfinding";
import type { Point, TownMap } from "./map";

export type AgentSpec = {
  id: string;
  name: string;
  color: string;
  homeId: string;
  schedule: [string, string][];
  // [start time, location id]
};

export const AGENT_SPECS: AgentSpec[] = [
  {
    id: "maren",
    name: "Maren",
    color: "#f59e0b",
    homeId: "home_maren",
    schedule: [
      ["00:00", "home_maren"],
      ["05:00", "bakery"],
      ["12:00", "tavern"],
      ["13:00", "bakery"],
      ["17:30", "park"],
      ["19:00", "tavern"],
      ["21:30", "home_maren"],
    ],
  },
  {
    id: "dorrik",
    name: "Dorrik",
    color: "#ef4444",
    homeId: "home_dorrik",
    schedule: [
      ["00:00", "home_dorrik"],
      ["06:00", "smithy"],
      ["12:30", "tavern"],
      ["13:30", "smithy"],
      ["18:00", "tavern"],
      ["22:00", "home_dorrik"],
    ],
  },
  {
    id: "ilsa",
    name: "Ilsa",
    color: "#a855f7",
    homeId: "home_ilsa",
    schedule: [
      ["00:00", "home_ilsa"],
      ["07:00", "park"],
      ["11:30", "bakery"],
      ["12:30", "park"],
      ["17:00", "home_ilsa"],
    ],
  },
  {
    id: "tobias",
    name: "Tobias",
    color: "#3b82f6",
    homeId: "home_tobias",
    schedule: [
      ["00:00", "home_tobias"],
      ["08:00", "smithy"],
      ["11:00", "park"],
      ["13:00", "tavern"],
      ["15:00", "bakery"],
      ["18:00", "tavern"],
      ["23:00", "home_tobias"],
    ],
  },
  {
    id: "edda",
    name: "Edda",
    color: "#10b981",
    homeId: "home_edda",
    schedule: [
      ["00:00", "home_edda"],
      ["07:30", "townhall"],
      ["12:00", "bakery"],
      ["13:00", "townhall"],
      ["17:00", "park"],
      ["18:30", "home_edda"],
    ],
  },
];

// How long a spoken line stays visible, in game minutes.
const SAY_TICKS = 60;

export class Agent {
  x: number;
  y: number;
  targetId: string;
  thinking = false;
  private path: Point[] = [];
  private readonly schedule: { from: number; locationId: string }[];
  private overrideId: string | null = null;
  private lastScheduled: string | null = null;
  private saying: { text: string; untilTick: number } | null = null;

  constructor(
    readonly spec: AgentSpec,
    private readonly map: TownMap,
  ) {
    this.schedule = spec.schedule
      .map(([time, locationId]) => ({ from: parseMinute(time), locationId }))
      .sort((a, b) => a.from - b.from);
    if (this.schedule[0]?.from !== 0) throw new Error(`${spec.name}: schedule must start at 00:00`);
    for (const entry of this.schedule) map.location(entry.locationId);

    const home = map.location(spec.homeId);
    this.x = home.x;
    this.y = home.y;
    this.targetId = spec.homeId;
  }

  scheduledLocation(minuteOfDay: number): string {
    let current = this.schedule[0].locationId;
    for (const entry of this.schedule) {
      if (entry.from <= minuteOfDay) current = entry.locationId;
    }
    return current;
  }

  nextScheduled(minuteOfDay: number): { from: number; locationId: string } | null {
    return this.schedule.find((entry) => entry.from > minuteOfDay) ?? null;
  }

  get walking(): boolean {
    return this.path.length > 0;
  }

  // Advance one tick. Returns true when the agent has just arrived at the place its schedule asked for.
  // That is a decision point. Arriving at a place the LLM chose is not, so the LLM cannot chain moves forever.
  update(minuteOfDay: number): boolean {
    const scheduled = this.scheduledLocation(minuteOfDay);
    if (scheduled !== this.lastScheduled) {
      this.lastScheduled = scheduled;
      this.overrideId = null;
    }
    const wanted = this.overrideId ?? scheduled;
    if (wanted !== this.targetId) {
      this.targetId = wanted;
      const route = findPath(this.map, { x: this.x, y: this.y }, this.map.location(wanted));
      // Unreachable targets are a map bug (the tests check reachability). Stay put rather than crash the sim.
      this.path = route ?? [];
    }
    const stepping = this.path.length > 0;
    const next = this.path.shift();
    if (next) {
      this.x = next.x;
      this.y = next.y;
    }
    return stepping && this.path.length === 0 && this.overrideId === null;
  }

  applyDecision(decision: AgentDecision, tick: number): void {
    this.thinking = false;
    if (decision.action === "move_to") this.overrideId = decision.target;
    if (decision.action === "speak") this.saying = { text: decision.say, untilTick: tick + SAY_TICKS };
  }

  state(tick: number): AgentState {
    const target = this.map.location(this.targetId);
    const place = this.walking ? `Walking to ${target.name}` : `At ${target.name}`;
    return {
      id: this.spec.id,
      name: this.spec.name,
      color: this.spec.color,
      x: this.x,
      y: this.y,
      walking: this.walking,
      targetId: this.targetId,
      activity: this.thinking ? `Thinking. ${place}` : place,
      thinking: this.thinking,
      say: this.saying && tick < this.saying.untilTick ? this.saying.text : null,
    };
  }
}
