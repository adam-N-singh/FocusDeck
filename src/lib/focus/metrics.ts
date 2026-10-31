import { MODE_BY_ID, SWITCH_COST_MINUTES, WARNING_THRESHOLD, WARNING_WINDOW_MINUTES, resolveMode, type ModeMap } from "./modes";
import { classifyNotification } from "./classifier";
import type { AppId, DayMetrics, FocusEvent, NotificationClass } from "./types";

export interface MetricsOptions {
  /** The user's declared modes. Defaults to the built-ins. */
  modes?: ModeMap;
  /**
   * How each non-switch event was classified. Defaults to the deterministic
   * rules; the live deck passes its logged decisions (rules + System One) so
   * the counters match what actually happened.
   */
  classify?: (event: FocusEvent) => NotificationClass;
  /** Count the trailing focus stretch up to this minute (the live deck passes "now"). */
  endMinute?: number;
}

/** Aggregate a day of events into the numbers that make 506 switches legible. */
export function computeMetrics(events: FocusEvent[], options: MetricsOptions = {}): DayMetrics {
  const modes = options.modes ?? MODE_BY_ID;
  const classify = options.classify ?? ((e: FocusEvent) => classifyNotification(e, e.modeAtEvent, modes).classification);
  const sorted = [...events].sort((a, b) => a.atMinute - b.atMinute);
  const switches = sorted.filter((e) => e.kind === "app-switch");

  let contextSwitches = 0;
  let interruptions = 0;
  let attendedInMode = 0;
  let interruptionsAvoided = 0;
  let openLoops = 0;
  const switchesByApp: Partial<Record<AppId, number>> = {};
  const contextSwitchTimes: number[] = [];

  for (const event of switches) {
    switchesByApp[event.app] = (switchesByApp[event.app] ?? 0) + 1;
    if (!resolveMode(modes, event.modeAtEvent).allowedApps.includes(event.app)) {
      contextSwitches += 1;
      contextSwitchTimes.push(event.atMinute);
    }
  }

  for (const event of sorted) {
    if (event.kind === "app-switch") continue;
    if (classify(event) === "needs-you-now") {
      // Attended immediately, so it never becomes an open loop. It only costs
      // a refocus in a protected mode: in Reviewing agents the event *is* the work.
      if (resolveMode(modes, event.modeAtEvent).isProtected === false) attendedInMode += 1;
      else interruptions += 1;
    } else {
      interruptionsAvoided += 1;
      if (event.kind === "agent-needs-input") openLoops += 1;
    }
  }

  return {
    totalSwitches: switches.length,
    contextSwitches,
    interruptions,
    attendedInMode,
    interruptionsAvoided,
    openLoops,
    longestFocusStretchMinutes: longestStretch(sorted, modes, classify, options.endMinute),
    switchesByApp,
    warningCount: countWarnings(contextSwitchTimes),
  };
}

/** Longest gap between context switches / interruptions — your best deep-work block. */
function longestStretch(
  events: FocusEvent[],
  modes: ModeMap,
  classify: (e: FocusEvent) => NotificationClass,
  endMinute?: number,
): number {
  let best = 0;
  let lastBreak = events[0]?.atMinute ?? 0;
  for (const event of events) {
    const isBreak =
      event.kind !== "app-switch"
        ? classify(event) === "needs-you-now"
        : !resolveMode(modes, event.modeAtEvent).allowedApps.includes(event.app);
    if (isBreak) {
      best = Math.max(best, event.atMinute - lastBreak);
      lastBreak = event.atMinute;
    }
  }
  if (endMinute !== undefined && events.length > 0) best = Math.max(best, endMinute - lastBreak);
  return Math.round(best);
}

/** Context switches inside the rolling warning window ending at `minute`. */
export function contextSwitchesInWindow(contextSwitchTimes: number[], minute: number): number {
  const windowStart = minute - WARNING_WINDOW_MINUTES;
  return contextSwitchTimes.filter((t) => t > windowStart && t <= minute).length;
}

/** The "20-switch warning" from the thread, counted over a rolling window. */
function countWarnings(contextSwitchTimes: number[]): number {
  let warnings = 0;
  for (let i = 0; i < contextSwitchTimes.length; i++) {
    if (contextSwitchesInWindow(contextSwitchTimes, contextSwitchTimes[i]) === WARNING_THRESHOLD) warnings += 1;
  }
  return warnings;
}

/** Estimated refocus cost of the day, in minutes. */
export function estimatedLostMinutes(metrics: DayMetrics): number {
  const inModeSwitches = metrics.totalSwitches - metrics.contextSwitches;
  return Math.round(
    inModeSwitches * SWITCH_COST_MINUTES.inMode +
      metrics.contextSwitches * SWITCH_COST_MINUTES.context +
      metrics.interruptions * SWITCH_COST_MINUTES.interruption +
      (metrics.attendedInMode ?? 0) * SWITCH_COST_MINUTES.inMode,
  );
}
