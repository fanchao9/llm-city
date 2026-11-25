// Central settings for the simulation process. Override with environment variables.
export const config = {
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
  chatModel: process.env.CHAT_MODEL ?? "llama3.1:8b",
  embedModel: process.env.EMBED_MODEL ?? "nomic-embed-text",
  // HTTP server that the browser UI connects to.
  simPort: Number(process.env.SIM_PORT ?? 4000),
  // Browser origins allowed to read the stream and send controls (comma separated).
  uiOrigins: (process.env.UI_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000").split(","),
};
