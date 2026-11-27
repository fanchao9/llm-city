"use client";

import type { CallRecord } from "@/sim/protocol";

function Block({ title, children }: { title: string; children: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-950 p-2 font-mono text-xs text-zinc-300">
        {children}
      </pre>
    </div>
  );
}

function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function summary(call: CallRecord): string {
  const { action, target, say } = call.decision;
  if (call.source === "fallback") return "fallback";
  if (action === "move_to") return `move to ${target}`;
  if (action === "speak") return `says "${say}"`;
  return "continue";
}

// Every LLM decision, with the prompt that went in and the raw answers that came back.
export default function CallInspector({ calls }: { calls: CallRecord[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">LLM calls</h2>
      {calls.length === 0 && (
        <p className="text-sm text-zinc-500">
          No decisions yet. A thinking agent asks the model each time it arrives at a place on its schedule.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {calls.map((call) => (
          <li key={call.id}>
            <details className="rounded border border-zinc-800 bg-zinc-900">
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="font-mono text-zinc-400">
                  D{call.day} {call.time}
                </span>
                <span className="font-medium">{call.agentName}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-300">{summary(call)}</span>
                {call.source === "fallback" && (
                  <span className="rounded bg-red-900 px-1.5 py-0.5 text-xs text-red-100">fallback</span>
                )}
                {call.attempts.length > 1 && (
                  <span className="rounded bg-amber-900 px-1.5 py-0.5 text-xs text-amber-100">
                    {call.attempts.length} attempts
                  </span>
                )}
                <span className="font-mono text-xs text-zinc-500">{(call.durationMs / 1000).toFixed(1)}s</span>
              </summary>

              <div className="flex flex-col gap-3 border-t border-zinc-800 p-3">
                <p className="text-sm text-zinc-300">
                  <span className="text-zinc-500">Result: </span>
                  {call.outcome}
                </p>
                <Block title="System prompt">{call.system}</Block>
                <Block title="User prompt">{call.user}</Block>
                {call.attempts.map((attempt, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <Block title={`Answer, attempt ${i + 1} (${call.model})`}>{formatJson(attempt.raw) || "(empty)"}</Block>
                    <p className={`text-xs ${attempt.error ? "text-red-300" : "text-zinc-500"}`}>
                      {attempt.error ? `Rejected: ${attempt.error}. ` : "Accepted. "}
                      {attempt.durationMs} ms, {attempt.promptTokens} tokens in, {attempt.completionTokens} out
                    </p>
                  </div>
                ))}
                <details>
                  <summary className="cursor-pointer text-xs text-zinc-500">JSON schema sent to the model</summary>
                  <div className="mt-2">
                    <Block title="format">{JSON.stringify(call.schema, null, 2)}</Block>
                  </div>
                </details>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
