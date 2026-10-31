import { classifyNotification } from "../classifier";
import type { UserModel } from "../model";
import { contextSwitchesInWindow, computeMetrics, estimatedLostMinutes } from "../metrics";
import { resolveMode, type ModeMap } from "../modes";
import { isOpen, summarizeLoops, type LoopSummary } from "../loops";
import type { DayMetrics, FocusEvent } from "../types";
import { appendLog, createDeck, type DeckState, type Signal } from "./state";

/** Read-only views over a deck, for the Now screen and the mirror. */

export interface OfferStats {
  shown: number;
  accepted: number;
  dismissed: number;
  skipped: number;
  defectionsOffered: number;
  defectionsAccepted: number;
}

export function offerStats(signals: Signal[]): OfferStats {
  const defections = signals.filter((s) => s.trigger === "defection");
  return {
    shown: signals.length,
    accepted: signals.filter((s) => s.response === "accepted").length,
    dismissed: signals.filter((s) => s.response === "dismissed").length,
    skipped: signals.filter((s) => s.response === "skipped").length,
    defectionsOffered: defections.length,
    defectionsAccepted: defections.filter((s) => s.response === "accepted").length,
  };
}

/** Today's counters, using the deck's own logged decisions (rules + System One), not a re-derivation. */
export function deckMetrics(deck: DeckState, modes: ModeMap, options: { includeManual?: boolean } = {}): DayMetrics {
  const events = options.includeManual === false ? deck.events.filter((e) => e.origin !== "manual") : deck.events;
  return computeMetrics(events, {
    modes,
    classify: (e: FocusEvent) => deck.decisions[e.id] ?? classifyNotification(e, e.modeAtEvent, modes).classification,
    endMinute: deck.clock,
  });
}

/** Context switches in the rolling hour — the live 20-switch gauge. */
export function rollingContextSwitches(deck: DeckState, modes: ModeMap): number {
  const times = deck.events
    .filter((e) => e.kind === "app-switch" && !resolveMode(modes, e.modeAtEvent).allowedApps.includes(e.app))
    .map((e) => e.atMinute);
  return contextSwitchesInWindow(times, deck.clock);
}

/** Minutes until the next scheduled review moment (0 when due). */
export function nextReviewIn(deck: DeckState, model: UserModel): number {
  return Math.max(0, Math.round(deck.lastReviewAt + model.reviewEveryMinutes - deck.clock));
}

export interface DeckView {
  metrics: DayMetrics;
  lostMinutes: number;
  loops: LoopSummary;
  offers: OfferStats;
  rollingContextSwitches: number;
  nextReviewInMinutes: number;
  heldWaiting: number;
  releasedUnread: number;
}

export function deckView(deck: DeckState, model: UserModel, modes: ModeMap): DeckView {
  const metrics = deckMetrics(deck, modes);
  return {
    metrics,
    lostMinutes: estimatedLostMinutes(metrics),
    loops: summarizeLoops(deck.loops, deck.clock),
    offers: offerStats(deck.signals),
    rollingContextSwitches: rollingContextSwitches(deck, modes),
    nextReviewInMinutes: nextReviewIn(deck, model),
    heldWaiting: deck.held.filter((h) => h.releasedAtMinute === undefined).length,
    releasedUnread: deck.held.filter((h) => h.releasedAtMinute !== undefined && !h.acknowledged).length,
  };
}

/**
 * Start a new day. Open loops carry over — an agent doesn't stop waiting at
 * midnight — with their timestamps shifted so ages stay true. Everything
 * else starts fresh; the old day is archived by the caller (mirror history).
 */
export function rollOverDeck(deck: DeckState, day: string, clock: number, daysElapsed = 1): DeckState {
  const shift = 1440 * Math.max(1, daysElapsed);
  const carried = deck.loops.filter(isOpen).map((loop) => ({ ...loop, openedAtMinute: loop.openedAtMinute - shift, batched: true }));
  const fresh = { ...createDeck(day, clock, deck.activeMode), paused: deck.paused, loops: carried };
  return carried.length === 0
    ? fresh
    : appendLog(fresh, {
        type: "system",
        atMinute: clock,
        label: "New day",
        explanation: `${carried.length} open loop${carried.length === 1 ? "" : "s"} carried over from yesterday — agents don't stop waiting at midnight.`,
      });
}
