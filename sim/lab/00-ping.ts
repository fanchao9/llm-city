import { config } from "../config";

type TagsResponse = { models: { name: string }[] };

type ChatResponse = {
  message: { content: string };
  eval_count: number;
  eval_duration: number;
  load_duration: number;
  total_duration: number;
};

function hasModel(installed: string[], wanted: string): boolean {
  return installed.some((name) => name === wanted || name === `${wanted}:latest`);
}

async function main() {
  console.log(`Ollama URL: ${config.ollamaUrl}`);

  let tags: TagsResponse;
  try {
    const res = await fetch(`${config.ollamaUrl}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    tags = (await res.json()) as TagsResponse;
  } catch (err) {
    console.error("FAIL: cannot reach Ollama. Is it installed and running?", err);
    process.exit(1);
  }

  const installed = tags.models.map((m) => m.name);
  console.log(`Installed models: ${installed.join(", ") || "(none)"}`);

  let missing = false;
  for (const wanted of [config.chatModel, config.embedModel]) {
    if (hasModel(installed, wanted)) {
      console.log(`OK:   ${wanted}`);
    } else {
      console.log(`MISSING: ${wanted}   ->   run: ollama pull ${wanted}`);
      missing = true;
    }
  }
  if (missing) process.exit(1);

  console.log("\nSending a test prompt (the first call loads the model into VRAM, so it is slower)...");
  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.chatModel,
      messages: [{ role: "user", content: "In one short sentence, say hello to the town of LLM City." }],
      stream: false,
    }),
  });
  if (!res.ok) {
    console.error(`FAIL: chat request returned HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const data = (await res.json()) as ChatResponse;
  const seconds = (ns: number) => (ns / 1e9).toFixed(2);

  console.log(`\nModel said: ${data.message.content.trim()}`);
  console.log(`Model load time:  ${seconds(data.load_duration)} s`);
  console.log(`Total time:       ${seconds(data.total_duration)} s`);
  console.log(`Tokens generated: ${data.eval_count}`);
  console.log(`Speed:            ${((data.eval_count / data.eval_duration) * 1e9).toFixed(1)} tokens/s`);
  console.log("\nPhase 0 setup looks good.");
}

main();
