import type { DayRecord } from "./history";

/**
 * Show — the weekly honest mirror (Hymah North-Star §7, Spec §3.6–3.7):
 * cumulative evidence that only rises, this week's trend with a state word
 * and no hero number, open-loop ageing, misses admitted and counted plainly,
 * at most one supportive statement, and the coming week. Adult and quiet.
 * Dismissals are never counted as misses: dismissing is always allowed.
 */
export type StateWord = "Climbing" | "Steady" | "Drifting";

export interface WeekSummary {
  weekStart: string; // Monday, YYYY-MM-DD
  days: number;
  demo: boolean;
  focusMinutes: number;
  contextSwitches: number;
  contextPerFocusHour: number | null;
  loopsOpened: number;
  loopsClosed: number;
  meanTimeToCloseMinutes: number | null;
  agedOverHour: number;
  offersShown: number;
  accepted: number;
  skipped: number;
  defectionsOffered: number;
  defectionAcceptRate: number | null;
  warnings: number;
  quietMoments: number;
  /** Relative health index for the trend line only — never displayed as a number. */
  index: number;
  state: StateWord | null;
  /** A drifting week forgiven by a later climb: it no longer counts against you. */
  forgiven: boolean;
}

export interface MirrorContext {
  reviewEveryMinutes: number;
  openLoopsNow: number;
  activeIntentions: number;
  trapApps: number;
  pendingProposals: number;
}

export interface Mirror {
  /** The week the mirror speaks about: this week, or last week before this one has any data. */
  thisWeek: WeekSummary | null;
  isCurrentWeek: boolean;
  weeks: WeekSummary[];
  state: StateWord | null;
  cumulative: { label: string; value: number; unit?: string }[];
  misses: { label: string; count: number }[];
  supportive: string | null;
  coming: string[];
  hasDemo: boolean;
}

/** Monday of the ISO week containing `day` (YYYY-MM-DD), computed in UTC to dodge time zones. */
export function weekStartOf(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

const sum = (days: DayRecord[], pick: (d: DayRecord) => number) => days.reduce((s, d) => s + pick(d), 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

function summarizeWeek(weekStart: string, days: DayRecord[]): Omit<WeekSummary, "index" | "state" | "forgiven"> {
  const focusMinutes = sum(days, (d) => d.focusMinutes);
  const contextSwitches = sum(days, (d) => d.contextSwitches);
  const closed = days.filter((d) => d.meanTimeToCloseMinutes !== null && d.loopsClosed > 0);
  const closedCount = sum(closed, (d) => d.loopsClosed);
  const defectionsOffered = sum(days, (d) => d.defectionsOffered);
  return {
    weekStart,
    days: days.length,
    demo: days.every((d) => d.demo),
    focusMinutes,
    contextSwitches,
    contextPerFocusHour: focusMinutes >= 30 ? round1(contextSwitches / (focusMinutes / 60)) : null,
    loopsOpened: sum(days, (d) => d.loopsOpened),
    loopsClosed: sum(days, (d) => d.loopsClosed),
    meanTimeToCloseMinutes: closedCount > 0 ? Math.round(sum(closed, (d) => (d.meanTimeToCloseMinutes ?? 0) * d.loopsClosed) / closedCount) : null,
    agedOverHour: sum(days, (d) => d.agedOverHour),
    offersShown: sum(days, (d) => d.offersShown),
    accepted: sum(days, (d) => d.accepted),
    skipped: sum(days, (d) => d.skipped),
    defectionsOffered,
    defectionAcceptRate: defectionsOffered >= 3 ? round1((100 * sum(days, (d) => d.defectionsAccepted)) / defectionsOffered) / 100 : null,
    warnings: sum(days, (d) => d.warnings),
    quietMoments: sum(days, (d) => d.quietMoments),
  };
}

/** Floors keep tiny absolute changes at low levels (1.0 → 1.3 switches an hour) from swinging the state word. */
const CONTEXT_FLOOR_PER_HOUR = 3;
const WAIT_FLOOR_MINUTES = 15;

/**
 * Improvement of `week` over `base` in [-1, 1] across the two headline targets
 * (context switches per focus hour, open-loop age — README next step 2) plus
 * how often you chose your own offer at a defection moment.
 */
function improvement(week: Omit<WeekSummary, "index" | "state" | "forgiven">, base: Omit<WeekSummary, "index" | "state" | "forgiven">): number | null {
  const clamp = (x: number) => Math.max(-1, Math.min(1, x));
  const parts: number[] = [];
  if (week.contextPerFocusHour !== null && base.contextPerFocusHour !== null) {
    parts.push(clamp((base.contextPerFocusHour - week.contextPerFocusHour) / Math.max(base.contextPerFocusHour, CONTEXT_FLOOR_PER_HOUR)));
  }
  if (week.meanTimeToCloseMinutes !== null && base.meanTimeToCloseMinutes !== null) {
    parts.push(clamp((base.meanTimeToCloseMinutes - week.meanTimeToCloseMinutes) / Math.max(base.meanTimeToCloseMinutes, WAIT_FLOOR_MINUTES)));
  }
  if (week.defectionAcceptRate !== null && base.defectionAcceptRate !== null) parts.push(clamp(2 * (week.defectionAcceptRate - base.defectionAcceptRate)));
  return parts.length > 0 ? parts.reduce((s, x) => s + x, 0) / parts.length : null;
}

const stateOf = (delta: number | null): StateWord | null => (delta === null ? null : delta >= 0.1 ? "Climbing" : delta <= -0.1 ? "Drifting" : "Steady");

export function buildWeeks(history: DayRecord[], maxWeeks = 6): WeekSummary[] {
  const byWeek = new Map<string, DayRecord[]>();
  for (const day of [...history].sort((a, b) => a.day.localeCompare(b.day))) {
    const key = weekStartOf(day.day);
    byWeek.set(key, [...(byWeek.get(key) ?? []), day]);
  }
  const raw = [...byWeek.entries()].slice(-maxWeeks).map(([start, days]) => summarizeWeek(start, days));
  const weeks: WeekSummary[] = [];
  let index = 100;
  raw.forEach((week, i) => {
    const delta = i > 0 ? improvement(week, raw[i - 1]) : null;
    index = Math.max(10, index * (1 + (delta ?? 0) / 2));
    weeks.push({ ...week, index: Math.round(index), state: stateOf(delta), forgiven: false });
  });
  // Improvement-triggered forgiveness: a climb forgives the drift before it.
  weeks.forEach((week, i) => {
    if (week.state !== "Climbing") return;
    for (let j = i - 1; j >= 0 && weeks[j].state !== "Climbing"; j--) {
      if (weeks[j].state === "Drifting") weeks[j] = { ...weeks[j], forgiven: true };
    }
  });
  return weeks;
}

/** The one supportive statement for the week — candor capped at one. */
function supportiveStatement(week: WeekSummary | null, prev: WeekSummary | null): string | null {
  if (!week) return null;
  if (prev && week.meanTimeToCloseMinutes !== null && prev.meanTimeToCloseMinutes && week.meanTimeToCloseMinutes <= prev.meanTimeToCloseMinutes * 0.8) {
    return `Agents waited ${week.meanTimeToCloseMinutes}m on average this week, down from ${prev.meanTimeToCloseMinutes}m. Your review moment is doing the work.`;
  }
  if (prev && week.contextPerFocusHour !== null && prev.contextPerFocusHour && week.contextPerFocusHour <= prev.contextPerFocusHour * 0.85) {
    return `${week.contextPerFocusHour} context switches per focus hour, down from ${prev.contextPerFocusHour}. Your modes are holding.`;
  }
  if (week.defectionAcceptRate !== null && week.defectionAcceptRate >= 0.3) {
    return `At the moments it was hardest, you chose what you said you wanted ${week.accepted} times.`;
  }
  if (week.state === "Drifting") {
    return "A heavier week. Nothing needs fixing tonight — your modes and review moments are still there on Monday.";
  }
  return week.loopsClosed > 0 ? `A steady week: ${week.loopsClosed} open loops closed.` : null;
}

export function buildMirror(history: DayRecord[], today: string, context: MirrorContext): Mirror {
  const weeks = buildWeeks(history);
  const currentStart = weekStartOf(today);
  const current = weeks.find((w) => w.weekStart === currentStart) ?? null;
  const thisWeek = current ?? weeks.at(-1) ?? null;
  const prev = thisWeek ? weeks[weeks.indexOf(thisWeek) - 1] ?? null : null;
  const focusHours = sum(history, (d) => d.focusMinutes) / 60;
  return {
    thisWeek,
    isCurrentWeek: current !== null,
    weeks,
    state: thisWeek?.state ?? null,
    // Cumulative evidence only ever rises: every entry is an all-time sum of non-negative counts.
    cumulative: [
      { label: "Times you chose what you said you wanted", value: sum(history, (d) => d.accepted) },
      { label: "Open loops closed", value: sum(history, (d) => d.loopsClosed) },
      { label: "Hours in protected modes", value: Math.round(focusHours * 10) / 10, unit: "h" },
      { label: "Days with FocusDeck", value: history.length },
    ],
    misses: thisWeek
      ? [
          { label: "Agents that waited over an hour", count: thisWeek.agedOverHour },
          { label: "Hours that crossed the 20-switch line", count: thisWeek.warnings },
          { label: "Offers that stepped aside unanswered", count: thisWeek.skipped },
          { label: "Moments FocusDeck stayed quiet (cool-off or caps) and may have missed", count: thisWeek.quietMoments },
        ]
      : [],
    supportive: supportiveStatement(thisWeek, prev),
    coming: [
      `Review moments every ${context.reviewEveryMinutes} minutes.`,
      context.openLoopsNow > 0 ? `${context.openLoopsNow} open loop${context.openLoopsNow === 1 ? "" : "s"} carrying into the week.` : "No open loops carrying over.",
      `${context.activeIntentions} intention${context.activeIntentions === 1 ? "" : "s"} active, ${context.trapApps} trap app${context.trapApps === 1 ? "" : "s"} watched.`,
      ...(context.pendingProposals > 0 ? [`${context.pendingProposals} proposal${context.pendingProposals === 1 ? "" : "s"} waiting for you in Declare — nothing changes until you confirm.`] : []),
    ],
    hasDemo: history.some((d) => d.demo),
  };
}
