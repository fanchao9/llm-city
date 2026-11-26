// Central settings for the simulation process. Override with environment variables.
export const config = {
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
  chatModel: process.env.CHAT_MODEL ?? "llama3.1:8b",
  embedModel: process.env.EMBED_MODEL ?? "nomic-embed-text",
  // Give up on one Ollama request after this long. A cold model load can take a while.
  llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 60_000),
  // How long Ollama keeps the model loaded in VRAM after a request.
  keepAlive: process.env.LLM_KEEP_ALIVE ?? "30m",
  // Agents that decide with the LLM (comma separated ids). The others follow their schedule only.
  // Set THINKING_AGENTS= (empty) to run the whole town without the LLM.
  thinkingAgents: (process.env.THINKING_AGENTS ?? "maren")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
  // HTTP server that the browser UI connects to.
  simPort: Number(process.env.SIM_PORT ?? 4000),
  // Browser origins allowed to read the stream and send controls (comma separated).
  uiOrigins: (process.env.UI_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000").split(","),
};
