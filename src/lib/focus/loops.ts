import type { AppId } from "./types";

/**
 * Open loops — the genuinely new unit in the combination (ASSESSMENT.md §3):
 * an agent blocked on you. Batching defers it but never deletes it, so it is
 * an ageable queue of *agents' claims on you*. README next step 2 makes its
 * age the headline optimisation target alongside context switches.
 */
export type LoopCloser = "accepted-offer" | "answered" | "review" | "agent-resumed";

export interface OpenLoop {
  id: string;
  eventId: string;
  app: AppId;
  /** Opaque agent/session id from the sensor, when it sent one. */
  source?: string;
  label: string;
  openedAtMinute: number;
  /** True when held for the review moment; false when surfaced to you at once. */
  batched: boolean;
  closedAtMinute?: number;
  closedBy?: LoopCloser;
}

/** A loop that waits longer than this is admitted as a miss in the weekly mirror. */
export const LOOP_AGED_MINUTES = 60;

export const isOpen = (loop: OpenLoop) => loop.closedAtMinute === undefined;

/** Minutes the agent has waited (until it was closed, or until now). */
export function loopAge(loop: OpenLoop, now: number): number {
  return Math.max(0, (loop.closedAtMinute ?? now) - loop.openedAtMinute);
}

export function openLoopsOldestFirst(loops: OpenLoop[]): OpenLoop[] {
  return loops.filter(isOpen).sort((a, b) => a.openedAtMinute - b.openedAtMinute);
}

export function closeLoop(loops: OpenLoop[], id: string, minute: number, by: LoopCloser): OpenLoop[] {
  return loops.map((loop) => (loop.id === id && isOpen(loop) ? { ...loop, closedAtMinute: minute, closedBy: by } : loop));
}

/** The loop an "agent resumed" signal closes: same session if known, else the oldest on that app. */
export function findLoopForResume(loops: OpenLoop[], app: AppId, source?: string): OpenLoop | undefined {
  const open = openLoopsOldestFirst(loops).filter((loop) => loop.app === app);
  return (source ? open.find((loop) => loop.source === source) : undefined) ?? open[0];
}

export interface LoopSummary {
  open: number;
  closed: number;
  oldestOpenMinutes: number;
  /** Total agent-minutes spent waiting on you (open + closed). */
  openLoopMinutes: number;
  meanTimeToCloseMinutes: number | null;
  /** Loops that waited past LOOP_AGED_MINUTES — counted plainly, never shamed. */
  agedOverHour: number;
}

export function summarizeLoops(loops: OpenLoop[], now: number): LoopSummary {
  const open = loops.filter(isOpen);
  const closed = loops.filter((loop) => !isOpen(loop));
  const ages = loops.map((loop) => loopAge(loop, now));
  const closeTimes = closed.map((loop) => loopAge(loop, now));
  return {
    open: open.length,
    closed: closed.length,
    oldestOpenMinutes: Math.round(Math.max(0, ...open.map((loop) => loopAge(loop, now)))),
    openLoopMinutes: Math.round(ages.reduce((sum, age) => sum + age, 0)),
    meanTimeToCloseMinutes: closeTimes.length > 0 ? Math.round(closeTimes.reduce((s, t) => s + t, 0) / closeTimes.length) : null,
    agedOverHour: ages.filter((age) => age > LOOP_AGED_MINUTES).length,
  };
}

/** "4m", "1h 05m" — how long something has waited. */
export function formatWait(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}m`;
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
}
