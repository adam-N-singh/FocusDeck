import { MODE_BY_ID, SWITCH_COST_MINUTES, WARNING_THRESHOLD, WARNING_WINDOW_MINUTES } from "./modes";
import { classifyNotification } from "./classifier";
import type { AppId, DayMetrics, FocusEvent } from "./types";

/** Aggregate a day of events into the numbers that make 506 switches legible. */
export function computeMetrics(events: FocusEvent[]): DayMetrics {
  const sorted = [...events].sort((a, b) => a.atMinute - b.atMinute);
  const switches = sorted.filter((e) => e.kind === "app-switch");

  let contextSwitches = 0;
  let interruptions = 0;
  let interruptionsAvoided = 0;
  let openLoops = 0;
  const switchesByApp: Partial<Record<AppId, number>> = {};
  const contextSwitchTimes: number[] = [];

  for (const event of switches) {
    switchesByApp[event.app] = (switchesByApp[event.app] ?? 0) + 1;
    if (!MODE_BY_ID[event.modeAtEvent].allowedApps.includes(event.app)) {
      contextSwitches += 1;
      contextSwitchTimes.push(event.atMinute);
    }
  }

  for (const event of sorted) {
    if (event.kind === "app-switch") continue;
    const { classification } = classifyNotification(event, event.modeAtEvent);
    if (classification === "needs-you-now") {
      interruptions += 1; // attended immediately, so it never becomes an open loop
    } else {
      interruptionsAvoided += 1;
      if (event.kind === "agent-needs-input") openLoops += 1;
    }
  }

  return {
    totalSwitches: switches.length,
    contextSwitches,
    interruptions,
    interruptionsAvoided,
    openLoops,
    longestFocusStretchMinutes: longestStretch(sorted),
    switchesByApp,
    warningCount: countWarnings(contextSwitchTimes),
  };
}

/** Longest gap between context switches / interruptions — your best deep-work block. */
function longestStretch(events: FocusEvent[]): number {
  let best = 0;
  let lastBreak = 0;
  for (const event of events) {
    const isBreak =
      event.kind !== "app-switch"
        ? classifyNotification(event, event.modeAtEvent).classification === "needs-you-now"
        : !MODE_BY_ID[event.modeAtEvent].allowedApps.includes(event.app);
    if (isBreak) {
      best = Math.max(best, event.atMinute - lastBreak);
      lastBreak = event.atMinute;
    }
  }
  return best;
}

/** The "20-switch warning" from the thread, counted over a rolling window. */
function countWarnings(contextSwitchTimes: number[]): number {
  let warnings = 0;
  for (let i = 0; i < contextSwitchTimes.length; i++) {
    const windowStart = contextSwitchTimes[i] - WARNING_WINDOW_MINUTES;
    const inWindow = contextSwitchTimes.filter((t) => t > windowStart && t <= contextSwitchTimes[i]).length;
    if (inWindow === WARNING_THRESHOLD) warnings += 1;
  }
  return warnings;
}

/** Estimated refocus cost of the day, in minutes. */
export function estimatedLostMinutes(metrics: DayMetrics): number {
  const inModeSwitches = metrics.totalSwitches - metrics.contextSwitches;
  return Math.round(
    inModeSwitches * SWITCH_COST_MINUTES.inMode +
      metrics.contextSwitches * SWITCH_COST_MINUTES.context +
      metrics.interruptions * SWITCH_COST_MINUTES.interruption,
  );
}
