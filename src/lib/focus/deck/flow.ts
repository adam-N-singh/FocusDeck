import { OFFER_PRIORITY, governorAllows, recordOfferShown } from "../governor";
import { matchIntention } from "../intentions";
import { isOpen, openLoopsOldestFirst } from "../loops";
import { REVIEW_MODE_ID, resolveMode } from "../modes";
import type { ModeId } from "../types";
import { enterModeOffer, loopOfferDraft, returnOffer, type OfferDraft } from "./offers";
import { appendLog, nextId, type DeckContext, type DeckState, type HeldItem, type Signal } from "./state";

/** Shared steps of the core loop, used by the reducer. All pure. */

export const advanceClock = (deck: DeckState, at: number): DeckState => (at > deck.clock ? { ...deck, clock: at } : deck);

const openLoopCount = (deck: DeckState) => deck.loops.filter(isOpen).length;

interface PresentOptions {
  /** Offers you started (inside a review moment) are not rationed by the governor. */
  governed?: boolean;
  /** When blocked, stay silent instead of logging why (for retries on every tick). */
  quiet?: boolean;
}

/** Can this draft be shown right now? Mirrors presentOffer's checks without side effects. */
export function canPresent(deck: DeckState, draft: OfferDraft, options: PresentOptions = {}): boolean {
  if (deck.paused) return false;
  if (options.governed !== false && !governorAllows(deck.governor, draft.trigger, deck.clock).ok) return false;
  return !deck.offer || OFFER_PRIORITY[draft.trigger] >= OFFER_PRIORITY[deck.offer.trigger];
}

/** Show one offer — governed, one at a time, and never while guarding is paused. */
export function presentOffer(deck: DeckState, ctx: DeckContext, draft: OfferDraft | null, options: PresentOptions = {}): DeckState {
  if (!draft || deck.paused) return deck;
  const current = deck.offer;
  if (current && current.trigger === draft.trigger && current.itemId === draft.itemId && current.loopId === draft.loopId && current.effect === draft.effect) {
    return deck; // already offering exactly this — don't churn
  }
  if (options.governed !== false) {
    const verdict = governorAllows(deck.governor, draft.trigger, deck.clock);
    if (!verdict.ok) {
      if (options.quiet) return deck;
      return appendLog({ ...deck, quietMoments: deck.quietMoments + 1 }, { type: "guard", atMinute: deck.clock, label: "Stayed quiet", explanation: verdict.reason });
    }
  }
  if (current) {
    if (OFFER_PRIORITY[draft.trigger] < OFFER_PRIORITY[current.trigger]) {
      return options.quiet ? deck : appendLog(deck, { type: "guard", atMinute: deck.clock, label: "Held back an offer", explanation: "Another offer is already showing — one thing at a time." });
    }
    deck = resolveOffer(deck, ctx, "skipped", "superseded");
  }
  const [id, next] = nextId(deck, "offer");
  const offer = { ...draft, id, atMinute: next.clock, mode: next.activeMode };
  const governor = options.governed === false ? next.governor : recordOfferShown(next.governor, draft.trigger, next.clock);
  return appendLog({ ...next, offer, note: null, governor }, {
    type: "offer",
    atMinute: next.clock,
    label: `Offered: ${offer.title}`,
    explanation: offer.trace,
  });
}

/** Record how the current offer ended — accepted, dismissed, or skipped — and clear it. */
export function resolveOffer(deck: DeckState, ctx: DeckContext, response: Signal["response"], skipReason?: Signal["context"]["skipReason"]): DeckState {
  const offer = deck.offer;
  if (!offer) return deck;
  const [id, next] = nextId(deck, "sig");
  const signal: Signal = {
    id,
    offerId: offer.id,
    trigger: offer.trigger,
    response,
    atMinute: next.clock,
    mode: next.activeMode,
    intentionId: offer.intentionId,
    itemId: offer.itemId ?? offer.loopId,
    itemKind: offer.itemKind,
    trapApp: offer.trapApp,
    context: {
      queueDepth: ctx.model.queue.length + openLoopCount(next),
      openLoops: openLoopCount(next),
      minutesInMode: Math.round(next.clock - next.modeSince),
      skipReason,
    },
  };
  // An interruption you didn't take doesn't vanish: the agent waits for your review moment.
  const loops = offer.loopId && response !== "accepted"
    ? next.loops.map((loop) => (loop.id === offer.loopId ? { ...loop, batched: true } : loop))
    : next.loops;
  return { ...next, offer: null, loops, signals: [...next.signals, signal] };
}

/** Surface held items whose moment has come. Returns the deck and how many were released. */
export function releaseHeld(deck: DeckState, reason: NonNullable<HeldItem["releasedBy"]>, at: number): [DeckState, number] {
  let released = 0;
  const held = deck.held.map((item) => {
    const due = item.releasedAtMinute === undefined && (reason === "new-day" || (reason === "review-moment" ? true : item.until === "mode-change"));
    if (!due) return item;
    released += 1;
    return { ...item, releasedAtMinute: at, releasedBy: reason };
  });
  return [{ ...deck, held }, released];
}

/** Inside a review moment: offer the next waiting agent, oldest first, then a way back. */
export function offerNextInReview(deck: DeckState, ctx: DeckContext): DeckState {
  if (deck.reviewSince === null || deck.offer) return deck;
  const next = openLoopsOldestFirst(deck.loops).find((loop) => !deck.reviewSkipped.includes(loop.id));
  if (next) {
    const intention = matchIntention(ctx.model.intentions, { when: "review-moment", mode: deck.activeMode });
    return presentOffer(deck, ctx, loopOfferDraft(deck, ctx, next, "review-moment", intention), { governed: false });
  }
  const cleared = deck.loops.filter((loop) => loop.closedAtMinute !== undefined && loop.closedAtMinute >= (deck.reviewSince ?? 0)).length;
  return presentOffer(deck, ctx, returnOffer(deck, ctx, cleared), { governed: false });
}

export function beginReview(deck: DeckState, ctx: DeckContext, at: number): DeckState {
  const [withReleased, released] = releaseHeld({ ...deck, reviewSince: at, lastReviewAt: at, reviewSkipped: [] }, "review-moment", at);
  const open = openLoopCount(withReleased);
  const started = appendLog(withReleased, {
    type: "review",
    atMinute: at,
    label: "Review moment started",
    explanation: `${open} open loop${open === 1 ? "" : "s"} to walk through, oldest first. ${released} held item${released === 1 ? "" : "s"} released to you.`,
  });
  return offerNextInReview(started, ctx);
}

export function endReview(deck: DeckState, at: number): DeckState {
  if (deck.reviewSince === null) return deck;
  const since = deck.reviewSince;
  const cleared = deck.loops.filter((loop) => loop.closedAtMinute !== undefined && loop.closedAtMinute >= since).length;
  return appendLog({ ...deck, reviewSince: null, reviewSkipped: [] }, {
    type: "review",
    atMinute: at,
    label: "Review moment ended",
    explanation: `Cleared ${cleared} open loop${cleared === 1 ? "" : "s"} in ${Math.max(1, Math.round(at - since))}m.`,
  });
}

/** A mode transition — the third trigger. Releases mode-held items and may ask today's one question. */
export function changeMode(deck: DeckState, ctx: DeckContext, mode: ModeId, at: number): DeckState {
  deck = advanceClock(deck, at);
  if (mode === deck.activeMode) return mode === REVIEW_MODE_ID && deck.reviewSince === null ? beginReview(deck, ctx, at) : deck;
  const from = deck.activeMode;
  if (deck.offer && deck.offer.trigger !== "interruption") deck = resolveOffer(deck, ctx, "skipped", "superseded");
  if (deck.reviewSince !== null && mode !== REVIEW_MODE_ID) deck = endReview(deck, at);
  const [released, count] = releaseHeld(deck, "mode-change", at);
  const modeTime = { ...released.modeTime, [from]: (released.modeTime[from] ?? 0) + Math.max(0, at - released.modeSince) };
  deck = { ...released, activeMode: mode, modeSince: at, modeTime, previousMode: mode === REVIEW_MODE_ID ? from : released.previousMode };
  deck = appendLog(deck, {
    type: "mode",
    atMinute: at,
    label: `${resolveMode(ctx.modes, from).label} → ${resolveMode(ctx.modes, mode).label}`,
    explanation: count > 0 ? `${count} item${count === 1 ? " was" : "s were"} held for this moment — they're ready for you now.` : "Nothing was being held.",
  });
  deck = mode === REVIEW_MODE_ID ? beginReview(deck, ctx, at) : presentOffer(deck, ctx, enterModeOffer(deck, ctx));
  if (!deck.questionAskedToday && !deck.pendingQuestion && !deck.paused && ctx.nextQuestion) {
    const question = ctx.nextQuestion(deck, mode);
    if (question) {
      deck = appendLog({ ...deck, pendingQuestion: question, questionAskedToday: true }, {
        type: "question",
        atMinute: at,
        label: "Asked today's one question",
        explanation: `At a mode boundary, never mid-flow: “${question.text}”`,
      });
    }
  }
  return deck;
}
