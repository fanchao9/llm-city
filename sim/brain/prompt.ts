// Builds the prompt for a decision point. Every fact in it comes from the world, so the model never has to recall anything.
import { formatMinute, timeAtTick } from "../world/clock";
import { PERSONAS } from "../world/personas";
import type { World } from "../world/world";

export type Prompt = {
  system: string;
  user: string;
  // Place ids the agent can pick for move_to.
  targets: string[];
};

export function buildPrompt(world: World, agentId: string): Prompt {
  const agent = world.agent(agentId);
  const persona = PERSONAS[agentId];
  if (!persona) throw new Error(`No persona for "${agentId}" in sim/world/personas.ts`);

  const { day, minuteOfDay, text: time } = timeAtTick(world.tick);
  const here = world.map.location(agent.targetId);

  // Public places plus the agent's own home. Other people's homes are off the menu.
  const places = world.map.locations.filter(
    (loc) => loc.id !== here.id && (loc.kind !== "home" || loc.id === agent.spec.homeId),
  );

  const nearby = world.agents.filter((a) => a !== agent && a.x === agent.x && a.y === agent.y);
  const next = agent.nextScheduled(minuteOfDay);

  const system = [
    `You are ${agent.spec.name}, the ${persona.occupation} of LLM City, a small town.`,
    `Personality: ${persona.traits.join(", ")}.`,
    `Background: ${persona.backstory}`,
    `Your goals: ${persona.goals.join("; ")}.`,
    "",
    "You decide what to do next. Stay in character and use only the facts you are given. Do not invent people, places or events. Reply with JSON only.",
  ].join("\n");

  const user = [
    `It is ${time} on day ${day}. You are at ${here.name}.`,
    nearby.length > 0 ? `Here with you: ${nearby.map((a) => a.spec.name).join(", ")}.` : "Nobody else is here.",
    next
      ? `Your usual routine: at ${formatMinute(next.from)} you go to ${world.map.location(next.locationId).name}.`
      : "Your usual routine has nothing else planned for today.",
    "",
    `Places you can go: ${places.map((p) => `${p.id} (${p.name})`).join(", ")}.`,
    "",
    "Your routine put you here, and following it is usually the right choice. Only do something else if you have a good reason.",
    "",
    "Choose one action:",
    "- continue: stay here and carry on with your routine.",
    "- move_to: walk somewhere else instead. Set target to the place id. You return to your routine when it next changes.",
    "- speak: say something out loud. Set say to what you say.",
    "",
    "What do you do next?",
  ].join("\n");

  return { system, user, targets: places.map((p) => p.id) };
}
