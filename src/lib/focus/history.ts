import { deckMetrics, offerStats } from "./deck/summary";
import type { DeckState } from "./deck/state";
import { estimatedLostMinutes } from "./metrics";
import { summarizeLoops } from "./loops";
import type { ModeMap } from "./modes";

/**
 * One day, reduced to the numbers the weekly honest mirror needs. Derived
 * data only — no event labels, no sources, nothing a sensor saw beyond counts.
 * Manual test events are excluded: the mirror only reflects real days.
 */
export interface DayRecord {
  day: string; // YYYY-MM-DD
  /** Seeded demo history is always labelled, never mixed silently with real days. */
  demo?: boolean;
  /** Minutes spent in protected (focus) modes. */
  focusMinutes: number;
  totalSwitches: number;
  contextSwitches: number;
  interruptions: number;
  heldBack: number;
  warnings: number;
  loopsOpened: number;
  loopsClosed: number;
  openLoopMinutes: number;
  meanTimeToCloseMinutes: number | null;
  agedOverHour: number;
  offersShown: number;
  accepted: number;
  dismissed: number;
  skipped: number;
  defectionsOffered: number;
  defectionsAccepted: number;
  /** Times FocusDeck chose silence (cool-off, caps) — admitted, because it may have missed a moment. */
  quietMoments: number;
  longestFocusStretchMinutes: number;
  estimatedLostMinutes: number;
}

/** Minutes per mode for the day so far, including the current stretch. */
export function modeMinutes(deck: DeckState): Record<string, number> {
  const current = Math.max(0, deck.clock - deck.modeSince);
  return { ...deck.modeTime, [deck.activeMode]: (deck.modeTime[deck.activeMode] ?? 0) + current };
}

export function summarizeDay(deck: DeckState, modes: ModeMap): DayRecord {
  const metrics = deckMetrics(deck, modes, { includeManual: false });
  const loops = summarizeLoops(deck.loops, deck.clock);
  const offers = offerStats(deck.signals);
  const minutes = modeMinutes(deck);
  const focusMinutes = Object.entries(minutes)
    .filter(([id]) => modes[id]?.isProtected !== false)
    .reduce((sum, [, m]) => sum + m, 0);
  return {
    day: deck.day,
    focusMinutes: Math.round(focusMinutes),
    totalSwitches: metrics.totalSwitches,
    contextSwitches: metrics.contextSwitches,
    interruptions: metrics.interruptions,
    heldBack: metrics.interruptionsAvoided,
    warnings: deck.governor.warningTimes.length,
    loopsOpened: deck.loops.length,
    loopsClosed: loops.closed,
    openLoopMinutes: loops.openLoopMinutes,
    meanTimeToCloseMinutes: loops.meanTimeToCloseMinutes,
    agedOverHour: loops.agedOverHour,
    offersShown: offers.shown,
    accepted: offers.accepted,
    dismissed: offers.dismissed,
    skipped: offers.skipped,
    defectionsOffered: offers.defectionsOffered,
    defectionsAccepted: offers.defectionsAccepted,
    quietMoments: deck.quietMoments,
    longestFocusStretchMinutes: metrics.longestFocusStretchMinutes,
    estimatedLostMinutes: estimatedLostMinutes(metrics),
  };
}

/** Did anything happen worth archiving? An untouched day isn't a "zero" day — it's no data. */
export const hasActivity = (record: DayRecord) => record.totalSwitches + record.loopsOpened + record.offersShown + record.heldBack > 0;

/** Insert or replace a day, keeping history sorted and bounded (about a year). */
export function upsertDay(history: DayRecord[], record: DayRecord, maxDays = 400): DayRecord[] {
  const merged = [...history.filter((d) => d.day !== record.day), record].sort((a, b) => a.day.localeCompare(b.day));
  return merged.slice(Math.max(0, merged.length - maxDays));
}
