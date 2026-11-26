// The one place the simulation talks to Ollama.
//
//   chat()      raw call, returns text plus token counts and timing
//   chatJson()  chat with a Zod schema: forces the JSON shape, validates it, retries once
//   embed()     text -> vectors, used for memory retrieval later
//
// Every call goes through a queue that runs one request at a time (the GPU does one generation at a time anyway).
import { z } from "zod";
import { config } from "../config";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatRequest = {
  messages: ChatMessage[];
  format?: object;
  temperature?: number;
  maxTokens?: number;
};

export type ChatResult = {
  content: string;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
};

export interface LlmClient {
  readonly model: string;
  chat(request: ChatRequest): Promise<ChatResult>;
  embed(texts: string[]): Promise<number[][]>;
}

// ---- queue ----
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  add<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

// ---- Ollama ----
type OllamaChatResponse = {
  message: { content: string };
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
};

export class OllamaClient implements LlmClient {
  private readonly queue = new SerialQueue();

  constructor(
    readonly model: string = config.chatModel,
    private readonly embedModel: string = config.embedModel,
    private readonly baseUrl: string = config.ollamaUrl,
  ) {}

  chat(request: ChatRequest): Promise<ChatResult> {
    return this.queue.add(async () => {
      const started = performance.now();
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The timeout starts when the request starts running, not when it was queued.
        signal: AbortSignal.timeout(config.llmTimeoutMs),
        body: JSON.stringify({
          model: this.model,
          messages: request.messages,
          stream: false,
          format: request.format,
          keep_alive: config.keepAlive,
          options: { temperature: request.temperature ?? 0.7, num_predict: request.maxTokens ?? 300 },
        }),
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as OllamaChatResponse;

      const result: ChatResult = {
        content: data.message.content.trim(),
        durationMs: Math.round(performance.now() - started),
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
      };
      const speed = data.eval_duration ? ((result.completionTokens / data.eval_duration) * 1e9).toFixed(1) : "?";
      console.log(
        `[llm] chat ${this.model} ${(result.durationMs / 1000).toFixed(1)}s, ${result.promptTokens} in / ${result.completionTokens} out (${speed} tok/s)`,
      );
      return result;
    });
  }

  embed(texts: string[]): Promise<number[][]> {
    return this.queue.add(async () => {
      const started = performance.now();
      const res = await fetch(`${this.baseUrl}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(config.llmTimeoutMs),
        body: JSON.stringify({ model: this.embedModel, input: texts, keep_alive: config.keepAlive }),
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const { embeddings } = (await res.json()) as { embeddings: number[][] };
      console.log(`[llm] embed ${this.embedModel} ${texts.length} text(s) ${Math.round(performance.now() - started)}ms`);
      return embeddings;
    });
  }
}

// ---- structured output ----
export type Attempt = {
  raw: string;
  error: string | null;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
};

export type JsonResult<T> =
  | { ok: true; value: T; attempts: Attempt[] }
  | { ok: false; attempts: Attempt[] };

export function toFormat(schema: z.ZodType): object {
  const format = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  delete format.$schema;
  return format;
}

// Asks for JSON matching `schema`. The schema in `format` forces the shape. Zod then checks the rules JSON schema
// cannot express. Tries up to `maxAttempts` times and never throws: the caller picks a fallback when ok is false.
export async function chatJson<T>(
  client: Pick<LlmClient, "chat">,
  schema: z.ZodType<T>,
  request: Omit<ChatRequest, "format">,
  maxAttempts = 2,
): Promise<JsonResult<T>> {
  const format = toFormat(schema);
  const attempts: Attempt[] = [];
  for (let i = 0; i < maxAttempts; i++) {
    let raw = "";
    let error: string | null;
    let stats = { durationMs: 0, promptTokens: 0, completionTokens: 0 };
    let value: T | undefined;
    try {
      const result = await client.chat({ ...request, format });
      raw = result.content;
      stats = { durationMs: result.durationMs, promptTokens: result.promptTokens, completionTokens: result.completionTokens };
      const parsed = schema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        value = parsed.data;
        error = null;
      } else {
        error = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
      }
    } catch (e) {
      error = e instanceof SyntaxError ? "not valid JSON" : e instanceof Error ? e.message : String(e);
    }
    attempts.push({ raw, error, ...stats });
    if (error === null) return { ok: true, value: value as T, attempts };
  }
  return { ok: false, attempts };
}
