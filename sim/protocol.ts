// Messages sent between the simulation process (sim/server.ts) and the browser UI.

// Ticks per real second that the UI can choose from. 1 tick = 1 game minute.
export const SPEEDS = [1, 5, 20, 60] as const;

export type LocationInfo = {
  id: string;
  name: string;
  kind: "home" | "bakery" | "smithy" | "tavern" | "townhall" | "park";
  x: number;
  y: number;
};

export type InitMessage = {
  width: number;
  height: number;
  rows: string[];
  locations: LocationInfo[];
  speeds: number[];
};

export type AgentState = {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  walking: boolean;
  targetId: string; // location the agent is heading to or standing at
  activity: string; // human-readable for UI
  thinking: boolean;
  say: string | null;
};

// Sent on every change (SSE event "state").
export type StateMessage = {
  tick: number;
  day: number;
  time: string; // HH:MM
  running: boolean;
  speed: number; // ticks per real second
  agents: AgentState[];
};

export type ControlRequest =
  | { action: "play" }
  | { action: "pause" }
  | { action: "step" }
  | { action: "reset" }
  | { action: "speed"; value: number };

export const DECISION_ACTIONS = ["continue", "move_to", "speak"] as const;
export type AgentDecision = {
  thought: string;
  action: (typeof DECISION_ACTIONS)[number];
  target: string;
  say: string;
};

export type CallAttempt = {
  raw: string;
  error: string | null;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
};

export type CallRecord = {
  id: number;
  agentId: string;
  agentName: string;
  day: number;
  time: string;
  model: string;
  system: string;
  user: string;
  schema: object;
  attempts: CallAttempt[];
  source: "llm" | "fallback";
  decision: AgentDecision;
  outcome: string;
  durationMs: number;
};