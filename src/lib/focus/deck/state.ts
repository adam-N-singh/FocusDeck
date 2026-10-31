import type { DecisionSource, SystemOneAdapter } from "../decision";
import { emptyGovernor, type GovernorState, type OfferTrigger } from "../governor";
import type { UserModel } from "../model";
import type { ModeMap } from "../modes";
import type { OpenLoop } from "../loops";
import type { QueueItemKind } from "../offer";
import type { AppId, EventKind, EventOrigin, FocusEvent, ModeId, NotificationClass } from "../types";

/**
 * The live deck: one day of the combined core loop. Pure data — every change
 * goes through reduceDeck (reducer.ts), so the whole loop is replayable and
 * testable without a browser, a clock, or a sensor.
 */
export const DECK_VERSION = 1;
export const MAX_LOG_ENTRIES = 400;
export const MAX_EVENTS_PER_DAY = 5000;

export type LogType = "event" | "mode" | "offer" | "signal" | "loop" | "review" | "guard" | "question" | "system";

/** One line of the clear activity log the thread asked for. */
export interface LogEntry {
  id: string;
  atMinute: number;
  mode: ModeId;
  type: LogType;
  label: string;
  explanation: string;
  eventId?: string;
  kind?: EventKind;
  app?: AppId;
  action?: NotificationClass;
  source?: DecisionSource;
  confidence?: number;
  origin?: EventOrigin;
  /** System One's probability, kept for the calibration spike. */
  needsUserNow?: number;
}

/** Something held back for you — an offer deferred, viewable anytime, never a wall. */
export interface HeldItem {
  id: string;
  eventId: string;
  kind: EventKind;
  app: AppId;
  label: string;
  atMinute: number;
  mode: ModeId;
  /** Batched items surface at the review moment; mode-held items at your next mode change. */
  until: "review-moment" | "mode-change";
  releasedAtMinute?: number;
  releasedBy?: "review-moment" | "mode-change" | "new-day";
  acknowledged?: boolean;
}

export type OfferEffect = "close-loop" | "start-review" | "open-item" | "return-to-mode";

/** The one offer for this moment (Hymah Spec §3.3). */
export interface Offer {
  id: string;
  trigger: OfferTrigger;
  atMinute: number;
  mode: ModeId;
  title: string;
  /** The Accept button's label: the smallest next step, not the whole task. */
  microAction: string;
  detail?: string;
  estimatedMinutes?: number;
  /** What Accept pre-loads. */
  url?: string;
  /** The user's own words, verbatim: "You said: …". */
  said?: string;
  intentionId?: string;
  itemId?: string;
  itemKind?: QueueItemKind;
  loopId?: string;
  /** The trap app whose opening triggered a defection offer. */
  trapApp?: AppId;
  /** Why this offer, traced to the user's own model (not a feed). */
  trace: string;
  effect: OfferEffect;
  returnMode?: ModeId;
}

/** Learn: every response is signal, never failure. Dismissals are logged silently. */
export interface Signal {
  id: string;
  offerId: string;
  trigger: OfferTrigger;
  response: "accepted" | "dismissed" | "skipped";
  atMinute: number;
  mode: ModeId;
  intentionId?: string;
  itemId?: string;
  itemKind?: QueueItemKind;
  trapApp?: AppId;
  context: {
    queueDepth: number;
    openLoops: number;
    minutesInMode: number;
    skipReason?: "expired" | "superseded" | "paused";
  };
}

export interface PendingQuestion {
  id: string;
  text: string;
}

export interface DeckState {
  version: typeof DECK_VERSION;
  /** Local date, YYYY-MM-DD. */
  day: string;
  /** Engine clock: minutes since the start of the day. */
  clock: number;
  activeMode: ModeId;
  modeSince: number;
  /** Minutes spent in each mode today, excluding the current stretch (add clock − modeSince). */
  modeTime: Record<string, number>;
  /** The mode to return to after a review moment. */
  previousMode?: ModeId;
  paused: boolean;
  events: FocusEvent[];
  /** How each non-switch event was actually decided (eventId → action), for honest counters. */
  decisions: Record<string, NotificationClass>;
  log: LogEntry[];
  loops: OpenLoop[];
  held: HeldItem[];
  offer: Offer | null;
  /** A one-line, guilt-free note after the last accept/dismiss. */
  note: string | null;
  signals: Signal[];
  governor: GovernorState;
  lastReviewAt: number;
  /** A review moment is in progress: offers walk the open loops, oldest first. */
  reviewSince: number | null;
  reviewSkipped: string[];
  pendingQuestion: PendingQuestion | null;
  questionAskedToday: boolean;
  /** Times the governor kept FocusDeck silent at a moment it would have spoken. */
  quietMoments: number;
  /** The user's "did this need you?" labels — the calibration spike's ground truth. */
  labels: Record<string, boolean>;
  seq: number;
}

/** What the reducer needs to know about the user. */
export interface DeckContext {
  model: UserModel;
  modes: ModeMap;
  systemOne?: SystemOneAdapter;
  /** Picks the one boundary question for today, if any (learn.ts). Asked at mode transitions only. */
  nextQuestion?: (deck: DeckState, enteringMode: ModeId) => PendingQuestion | null;
}

export type DeckAction =
  | { type: "event"; at: number; input: { kind: EventKind; app: AppId; label?: string; source?: string; origin?: EventOrigin } }
  | { type: "agent-resumed"; at: number; app: AppId; source?: string }
  | { type: "tick"; at: number }
  | { type: "set-mode"; at: number; mode: ModeId }
  | { type: "start-review"; at: number }
  | { type: "toggle-pause"; at: number }
  | { type: "accept-offer"; at: number }
  | { type: "dismiss-offer"; at: number }
  | { type: "close-loop"; at: number; loopId: string }
  | { type: "acknowledge-released"; at: number }
  | { type: "answer-question"; at: number; answer: "yes" | "no" | "skipped" }
  | { type: "label-event"; at: number; eventId: string; needed: boolean };

export function createDeck(day: string, clock: number, mode: ModeId = "building"): DeckState {
  return {
    version: DECK_VERSION,
    day,
    clock,
    activeMode: mode,
    modeSince: clock,
    modeTime: {},
    paused: false,
    events: [],
    decisions: {},
    log: [],
    loops: [],
    held: [],
    offer: null,
    note: null,
    signals: [],
    governor: emptyGovernor(),
    lastReviewAt: clock,
    reviewSince: null,
    reviewSkipped: [],
    pendingQuestion: null,
    questionAskedToday: false,
    quietMoments: 0,
    labels: {},
    seq: 0,
  };
}

/** Allocate an id and return the deck with its sequence advanced. */
export function nextId(deck: DeckState, prefix: string): [string, DeckState] {
  return [`${prefix}-${deck.day}-${deck.seq}`, { ...deck, seq: deck.seq + 1 }];
}

export function appendLog(deck: DeckState, entry: Omit<LogEntry, "id" | "mode"> & { mode?: ModeId }): DeckState {
  const [id, next] = nextId(deck, "log");
  const log = [...next.log, { ...entry, id, mode: entry.mode ?? next.activeMode }];
  return { ...next, log: log.length > MAX_LOG_ENTRIES ? log.slice(log.length - MAX_LOG_ENTRIES) : log };
}
