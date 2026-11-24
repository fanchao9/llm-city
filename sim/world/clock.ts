// Game time. One tick is one game minute. The world starts at START_MINUTE on day 1.
export const MINUTES_PER_DAY = 24 * 60;
export const START_MINUTE = 5 * 60;

export type GameTime = { day: number; minuteOfDay: number; text: string };

export function formatMinute(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Parse HH:MM into minutes since midnight.
export function parseMinute(text: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) throw new Error(`Bad time "${text}", expected HH:MM`);
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) throw new Error(`Bad time "${text}"`);
  return h * 60 + m;
}

export function timeAtTick(tick: number): GameTime {
  const total = START_MINUTE + tick;
  const minuteOfDay = total % MINUTES_PER_DAY;
  return { day: 1 + Math.floor(total / MINUTES_PER_DAY), minuteOfDay, text: formatMinute(minuteOfDay) };
}
