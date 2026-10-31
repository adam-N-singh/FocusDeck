/**
 * Clock helpers. The engine counts minutes since local midnight; nothing here
 * runs during server rendering, because the server's clock and time zone are
 * not yours (Next.js: client components prerender on the server).
 */
export function localDay(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function minuteOfDay(date: Date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

/** Whole days from one YYYY-MM-DD to another (calendar days, DST-safe). */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000));
}

/** Engine minute → "09:42". Pure, so it is safe to call while rendering. */
export function clockLabel(minute: number): string {
  const m = ((Math.floor(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Epoch ms from a sensor → engine minute today (clamped to now, never in the future). */
export function epochToMinute(epochMs: number, now: Date = new Date()): number {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return Math.min(minuteOfDay(now), Math.max(0, (epochMs - midnight.getTime()) / 60_000));
}
