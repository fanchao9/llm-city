// The simulation process. Runs the world clock and serves the browser UI over HTTP.
// Run with: npm run sim
//
//   GET  /events   Server-Sent Events: one "init" event, then a "state" event on every change.
//   POST /control  JSON body: {"action":"play"|"pause"|"step"|"reset"} or {"action":"speed","value":5}
//
// The server listens on 127.0.0.1 only, and only accepts browser requests from config.uiOrigins.
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { config } from "./config";
import { SPEEDS } from "./protocol";
import { World } from "./world/world";

const FRAME_MS = 50; // how often the loop checks whether a tick is due
const MAX_BODY_BYTES = 1024;
const KEEPALIVE_MS = 15_000;

const ControlSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("play") }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("step") }),
  z.object({ action: z.literal("reset") }),
  z.object({ action: z.literal("speed"), value: z.number().refine((v) => (SPEEDS as readonly number[]).includes(v), {
    message: `speed must be one of ${SPEEDS.join(", ")}`,
  }) }),
]);

let world = new World();
let running = false;
let speed: number = SPEEDS[1];
let accumulator = 0; // fractional ticks owed

const clients = new Set<ServerResponse>();

function currentState() {
  return world.stateMessage({ running, speed });
}

function sendEvent(res: ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast() {
  const payload = currentState();
  for (const res of clients) sendEvent(res, "state", payload);
}

// ---- tick loop ----
let lastFrame = performance.now();
setInterval(() => {
  const now = performance.now();
  const elapsedSeconds = (now - lastFrame) / 1000;
  lastFrame = now;
  if (!running) return;

  accumulator += elapsedSeconds * speed;
  // Cap catch-up after a stall so we never run a burst of thousands of ticks.
  const due = Math.min(Math.floor(accumulator), speed);
  if (due <= 0) return;
  accumulator = Math.min(accumulator - due, 1);
  for (let i = 0; i < due; i++) world.step();
  broadcast();
}, FRAME_MS);

// ---- HTTP ----
function allowedOrigin(req: IncomingMessage): string | null | "denied" {
  const origin = req.headers.origin;
  if (!origin) return null; // not a browser cross-origin request (curl, tests)
  return config.uiOrigins.includes(origin) ? origin : "denied";
}

function corsHeaders(origin: string | null): Record<string, string> {
  return origin
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        Vary: "Origin",
      }
    : {};
}

function json(res: ServerResponse, status: number, body: unknown, cors: Record<string, string>) {
  res.writeHead(status, { "Content-Type": "application/json", ...cors });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function applyControl(command: z.infer<typeof ControlSchema>) {
  switch (command.action) {
    case "play":
      running = true;
      lastFrame = performance.now();
      break;
    case "pause":
      running = false;
      accumulator = 0;
      break;
    case "step":
      running = false; // stepping by hand implies paused
      accumulator = 0;
      world.step();
      break;
    case "reset":
      world = new World();
      running = false;
      accumulator = 0;
      break;
    case "speed":
      speed = command.value;
      break;
  }
}

const server = http.createServer(async (req, res) => {
  const origin = allowedOrigin(req);
  if (origin === "denied") {
    res.writeHead(403).end("origin not allowed");
    return;
  }
  const cors = corsHeaders(origin);
  const path = new URL(req.url ?? "/", "http://localhost").pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors).end();
    return;
  }

  if (req.method === "GET" && path === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      ...cors,
    });
    sendEvent(res, "init", world.initMessage());
    sendEvent(res, "state", currentState());
    clients.add(res);
    const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), KEEPALIVE_MS);
    req.on("close", () => {
      clearInterval(keepAlive);
      clients.delete(res);
    });
    return;
  }

  if (req.method === "POST" && path === "/control") {
    let command: unknown;
    try {
      command = JSON.parse(await readBody(req));
    } catch {
      json(res, 400, { error: "body must be JSON of at most 1 KB" }, cors);
      return;
    }
    const parsed = ControlSchema.safeParse(command);
    if (!parsed.success) {
      json(res, 400, { error: parsed.error.issues.map((i) => i.message).join("; ") }, cors);
      return;
    }
    applyControl(parsed.data);
    broadcast();
    json(res, 200, currentState(), cors);
    return;
  }

  json(res, 404, { error: "not found" }, cors);
});

server.listen(config.simPort, "127.0.0.1", () => {
  console.log(`Simulation server on http://127.0.0.1:${config.simPort}`);
  console.log(`Allowed UI origins: ${config.uiOrigins.join(", ")}`);
});

function shutdown() {
  for (const res of clients) res.end();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
