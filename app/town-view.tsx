"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentState, ControlRequest, InitMessage, StateMessage } from "@/sim/protocol";

const SIM_URL = process.env.NEXT_PUBLIC_SIM_URL ?? "http://localhost:4000";
const TILE = 24;

const TILE_COLORS: Record<string, string> = {
  ".": "#7fb069", // grass
  "=": "#cdbd9c", // road
  ",": "#5fa052", // park grass
  "#": "#2f5d3a", // tree
  "~": "#4a90c2", // water
  H: "#a9795a", // house
  B: "#d9a066", // bakery
  S: "#7b8190", // smithy
  T: "#8b5a2b", // tavern
  M: "#b9b9d6", // town hall
};
const DOOR_BACKGROUND = "#cdbd9c";

// Offsets so agents standing on the same tile do not hide each other.
const STACK_OFFSETS: [number, number][] = [
  [0, 0],
  [0.3, 0.1],
  [-0.3, 0.1],
  [0.15, -0.3],
  [-0.15, -0.3],
  [0.3, -0.25],
  [-0.3, -0.25],
];

function drawMap(init: InitMessage): HTMLCanvasElement {
  const layer = document.createElement("canvas");
  layer.width = init.width * TILE;
  layer.height = init.height * TILE;
  const ctx = layer.getContext("2d")!;
  for (let y = 0; y < init.height; y++) {
    for (let x = 0; x < init.width; x++) {
      const ch = init.rows[y][x];
      const isBuilding = "HBSTM".includes(ch);
      const isDoor = !(ch in TILE_COLORS);
      ctx.fillStyle = isDoor ? DOOR_BACKGROUND : TILE_COLORS[ch];
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      if (isBuilding) {
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1);
      }
      if (ch === "#") {
        ctx.fillStyle = "#24472d";
        ctx.beginPath();
        ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE * 0.38, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  for (const loc of init.locations) {
    if (loc.kind === "park") {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.arc(loc.x * TILE + TILE / 2, loc.y * TILE + TILE / 2, TILE * 0.35, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#4a3b2a";
      ctx.fillRect(loc.x * TILE + 4, loc.y * TILE + 3, TILE - 8, TILE - 3);
    }
  }
  return layer;
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x, y);
}

export default function TownView() {
  const [init, setInit] = useState<InitMessage | null>(null);
  const [state, setState] = useState<StateMessage | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestState = useRef<StateMessage | null>(null);

  // Receive the world from the simulation process.
  useEffect(() => {
    const source = new EventSource(`${SIM_URL}/events`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false); // EventSource retries by itself
    source.addEventListener("init", (e) => setInit(JSON.parse((e as MessageEvent).data) as InitMessage));
    source.addEventListener("state", (e) => {
      const message = JSON.parse((e as MessageEvent).data) as StateMessage;
      latestState.current = message;
      setState(message);
    });
    return () => source.close();
  }, []);

  // Draw the world every animation frame, easing agents toward their latest server position.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!init || !canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = init.width * TILE * dpr;
    canvas.height = init.height * TILE * dpr;

    const mapLayer = drawMap(init);
    const shown = new Map<string, { x: number; y: number }>();
    let last = performance.now();
    let frame = 0;

    const render = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(mapLayer, 0, 0);

      for (const loc of init.locations) {
        const label = loc.kind === "home" ? loc.name.replace(" house", "") : loc.name;
        drawLabel(ctx, label, loc.x * TILE + TILE / 2, loc.y * TILE - 6, 10);
      }

      const agents: AgentState[] = latestState.current?.agents ?? [];
      const tileCount = new Map<string, number>();
      const ease = 1 - Math.exp(-dt * 10);
      for (const agent of agents) {
        const tileKey = `${agent.x},${agent.y}`;
        const index = tileCount.get(tileKey) ?? 0;
        tileCount.set(tileKey, index + 1);
        const [ox, oy] = STACK_OFFSETS[index % STACK_OFFSETS.length];
        const goalX = agent.x + 0.5 + ox;
        const goalY = agent.y + 0.5 + oy;
        const pos = shown.get(agent.id) ?? { x: goalX, y: goalY };
        pos.x += (goalX - pos.x) * ease;
        pos.y += (goalY - pos.y) * ease;
        shown.set(agent.id, pos);

        ctx.beginPath();
        ctx.arc(pos.x * TILE, pos.y * TILE, 7, 0, Math.PI * 2);
        ctx.fillStyle = agent.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
        drawLabel(ctx, agent.name, pos.x * TILE, pos.y * TILE + 19, 10);
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [init]);

  const send = useCallback(async (command: ControlRequest) => {
    try {
      const res = await fetch(`${SIM_URL}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      setError(res.ok ? null : `Simulation rejected the command (HTTP ${res.status})`);
    } catch {
      setError("Cannot reach the simulation. Start it with: npm run sim");
    }
  }, []);

  const buttonBase = "rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const buttonIdle = `${buttonBase} bg-zinc-800 hover:bg-zinc-700`;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex flex-col gap-3 lg:flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={`${buttonBase} bg-emerald-600 hover:bg-emerald-500 w-20`}
            disabled={!connected}
            onClick={() => send({ action: state?.running ? "pause" : "play" })}
          >
            {state?.running ? "Pause" : "Play"}
          </button>
          <button className={buttonIdle} disabled={!connected || state?.running} onClick={() => send({ action: "step" })}>
            Step
          </button>
          <div className="mx-1 h-6 w-px bg-zinc-700" />
          {(init?.speeds ?? []).map((speed) => (
            <button
              key={speed}
              className={`${buttonBase} ${state?.speed === speed ? "bg-sky-600" : "bg-zinc-800 hover:bg-zinc-700"}`}
              disabled={!connected}
              onClick={() => send({ action: "speed", value: speed })}
              title={`${speed} game minute${speed === 1 ? "" : "s"} per second`}
            >
              {speed}×
            </button>
          ))}
          <div className="mx-1 h-6 w-px bg-zinc-700" />
          <button className={buttonIdle} disabled={!connected} onClick={() => send({ action: "reset" })}>
            Reset
          </button>
          <div className="ml-auto flex items-center gap-2 font-mono text-sm">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-red-500"}`} />
            {state ? `Day ${state.day}  ${state.time}` : "--"}
          </div>
        </div>

        {!connected && (
          <p className="rounded border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            Not connected to the simulation. Start it in another terminal with <code className="font-mono">npm run sim</code>.
          </p>
        )}
        {error && connected && <p className="text-sm text-red-300">{error}</p>}

        <canvas
          ref={canvasRef}
          className="w-full rounded border border-zinc-700 bg-zinc-900"
          style={init ? { aspectRatio: `${init.width} / ${init.height}`, maxWidth: init.width * TILE * 1.5 } : { height: 300 }}
        />
        <p className="text-xs text-zinc-500">Speed: 1× is one game minute per second. 60× is one game hour per second.</p>
      </div>

      <aside className="lg:w-64">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Townspeople</h2>
        <ul className="flex flex-col gap-2">
          {(state?.agents ?? []).map((agent) => (
            <li key={agent.id} className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900 px-3 py-2">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: agent.color }} />
              <div className="min-w-0">
                <div className="text-sm font-medium">{agent.name}</div>
                <div className="truncate text-xs text-zinc-400">{agent.activity}</div>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
