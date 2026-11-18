// Central settings for the simulation process. Override with environment variables.

export const config = {
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
  chatModel: process.env.CHAT_MODEL ?? "llama3.1:8b",
  embedModel: process.env.EMBED_MODEL ?? "nomic-embed-text",
};
