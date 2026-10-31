import { appLabel } from "../apps";
import { GOVERNOR, recordDismiss } from "../governor";
import { matchIntention } from "../intentions";
import { closeLoop, findLoopForResume, formatWait, loopAge } from "../loops";
import { contextSwitchesInWindow } from "../metrics";
import { REVIEW_MODE_ID, WARNING_THRESHOLD, resolveMode } from "../modes";
import { decideInContext } from "../policy";
import type { FocusEvent } from "../types";
import { advanceClock, canPresent, changeMode, offerNextInReview, presentOffer, resolveOffer } from "./flow";
import { defectionOffer, loopOfferDraft, reviewMomentOffer, warningOffer } from "./offers";
import { MAX_EVENTS_PER_DAY, appendLog, nextId, type DeckAction, type DeckContext, type DeckState } from "./state";

/**
 * The combined core loop as one pure reducer:
 * Notice (events, ticks) → Classify in mode (policy.ts) → Offer or batch
 * (offers.ts) → Learn (signals on accept / dismiss / skip).
 * Declare lives in the user model; Show lives in mirror.ts.
 */
export function reduceDeck(deck: DeckState, action: DeckAction, ctx: DeckContext): DeckState {
  switch (action.type) {
    case "event":
      return handleEvent(deck, action, ctx);
    case "agent-resumed":
      return handleResume(deck, action, ctx);
    case "tick":
      return handleTick(advanceClock(deck, action.at), ctx);
    case "set-mode":
      return changeMode(deck, ctx, action.mode, action.at);
    case "start-review":
      return changeMode(deck, ctx, REVIEW_MODE_ID, action.at);
    case "toggle-pause":
      return togglePause(advanceClock(deck, action.at), ctx);
    case "accept-offer":
      return accept(advanceClock(deck, action.at), ctx);
    case "dismiss-offer":
      return dismiss(advanceClock(deck, action.at), ctx);
    case "close-loop":
      return closeByHand(advanceClock(deck, action.at), ctx, action.loopId);
    case "acknowledge-released":
      return { ...deck, held: deck.held.map((item) => (item.releasedAtMinute !== undefined ? { ...item, acknowledged: true } : item)) };
    case "answer-question":
      return answer(advanceClock(deck, action.at), action.answer);
    case "label-event":
      return { ...deck, labels: { ...deck.labels, [action.eventId]: action.needed } };
  }
}

function defaultLabel(kind: FocusEvent["kind"], app: FocusEvent["app"], source?: string): string {
  const who = `${appLabel(app)}${source ? ` · session ${source.slice(0, 6)}` : ""}`;
  if (kind === "app-switch") return `Switched to ${appLabel(app)}`;
  if (kind === "agent-needs-input") return `${who} needs your answer`;
  if (kind === "agent-finished") return `${who} finished`;
  return `${appLabel(app)} notification`;
}

function handleEvent(deck: DeckState, action: Extract<DeckAction, { type: "event" }>, ctx: DeckContext): DeckState {
  const { input, at } = action;
  // Designated apps only: anything else is structurally invisible past this line.
  if (!ctx.model.designatedApps.includes(input.app)) return deck;
  const [id, next] = nextId(advanceClock(deck, at), "ev");
  const event: FocusEvent = {
    id,
    atMinute: at,
    kind: input.kind,
    app: input.app,
    label: input.label ?? defaultLabel(input.kind, input.app, input.source),
    modeAtEvent: next.activeMode,
    source: input.source,
    origin: input.origin,
  };
  const events = next.events.length >= MAX_EVENTS_PER_DAY ? [...next.events.slice(1), event] : [...next.events, event];
  const withEvent = { ...next, events };
  return event.kind === "app-switch" ? handleSwitch(withEvent, event, ctx) : handleAgentOrNotification(withEvent, event, ctx);
}

function handleSwitch(deck: DeckState, event: FocusEvent, ctx: DeckContext): DeckState {
  const mode = resolveMode(ctx.modes, deck.activeMode);
  const inMode = mode.allowedApps.includes(event.app);
  deck = appendLog(deck, {
    type: "event",
    atMinute: event.atMinute,
    label: event.label,
    eventId: event.id,
    kind: event.kind,
    app: event.app,
    origin: event.origin,
    explanation: inMode
      ? `In-mode switch — ${appLabel(event.app)} is part of ${mode.label}. Cheap.`
      : `Context switch — ${appLabel(event.app)} isn't part of ${mode.label}.`,
  });
  if (inMode || deck.paused) return deck;

  // Defection moment: a trap app, opened outside the mode it belongs to.
  if (ctx.model.trapApps.includes(event.app)) deck = presentOffer(deck, ctx, defectionOffer(deck, ctx, event.app));

  // The 20-switch warning, counted relative to the mode at each switch.
  const contextTimes = deck.events
    .filter((e) => e.kind === "app-switch" && !resolveMode(ctx.modes, e.modeAtEvent).allowedApps.includes(e.app))
    .map((e) => e.atMinute);
  const count = contextSwitchesInWindow(contextTimes, event.atMinute);
  if (count >= WARNING_THRESHOLD) {
    const draft = warningOffer(deck, ctx, count);
    if (canPresent(deck, draft)) deck = presentOffer(deck, ctx, draft, { quiet: true });
  }
  return deck;
}

function handleAgentOrNotification(deck: DeckState, event: FocusEvent, ctx: DeckContext): DeckState {
  const decision = decideInContext(event, deck.activeMode, {
    modes: ctx.modes,
    intentions: ctx.model.intentions,
    quietFirstBuildHour: ctx.model.quietFirstBuildHour,
    minutesInMode: deck.clock - deck.modeSince,
    systemOneEnabled: ctx.model.systemOneEnabled,
    paused: deck.paused,
    systemOne: ctx.systemOne,
  });
  deck = appendLog({ ...deck, decisions: { ...deck.decisions, [event.id]: decision.action } }, {
    type: "event",
    atMinute: event.atMinute,
    label: event.label,
    eventId: event.id,
    kind: event.kind,
    app: event.app,
    origin: event.origin,
    action: decision.action,
    source: decision.source,
    confidence: decision.confidence,
    explanation: decision.explanation,
    needsUserNow: decision.systemOne?.needsUserNow,
  });

  if (event.kind === "agent-needs-input") {
    // Never suppressed: a blocked agent always becomes a countable open loop.
    const [loopId, next] = nextId(deck, "loop");
    const loop = {
      id: loopId,
      eventId: event.id,
      app: event.app,
      source: event.source,
      label: event.label,
      openedAtMinute: event.atMinute,
      batched: deck.paused || decision.action !== "needs-you-now",
    };
    deck = { ...next, loops: [...next.loops, loop] };
    if (deck.paused) return deck;
    if (deck.reviewSince !== null) return offerNextInReview(deck, ctx);
    if (decision.action !== "needs-you-now") return deck;
    const said = matchIntention(ctx.model.intentions, { when: "agent-blocks", mode: deck.activeMode });
    return presentOffer(deck, ctx, loopOfferDraft(deck, ctx, loop, "interruption", said));
  }

  if (deck.paused || decision.action === "needs-you-now") return deck;
  const [heldId, next] = nextId(deck, "held");
  return {
    ...next,
    held: [...next.held, {
      id: heldId,
      eventId: event.id,
      kind: event.kind,
      app: event.app,
      label: event.label,
      atMinute: event.atMinute,
      mode: next.activeMode,
      until: decision.action === "batch-for-later" ? "review-moment" : "mode-change",
    }],
  };
}

function handleResume(deck: DeckState, action: Extract<DeckAction, { type: "agent-resumed" }>, ctx: DeckContext): DeckState {
  if (!ctx.model.designatedApps.includes(action.app)) return deck;
  deck = advanceClock(deck, action.at);
  const loop = findLoopForResume(deck.loops, action.app, action.source);
  if (!loop) return deck;
  deck = appendLog({ ...deck, loops: closeLoop(deck.loops, loop.id, action.at, "agent-resumed") }, {
    type: "loop",
    atMinute: action.at,
    label: `Open loop closed: ${loop.label}`,
    explanation: `The agent resumed after ${formatWait(loopAge(loop, action.at))} — you answered it in its own window.`,
    app: loop.app,
  });
  if (deck.offer?.loopId === loop.id) deck = { ...deck, offer: null }; // resolved elsewhere: not a skip
  return offerNextInReview(deck, ctx);
}

function handleTick(deck: DeckState, ctx: DeckContext): DeckState {
  const offer = deck.offer;
  if (offer && deck.reviewSince === null && deck.clock - offer.atMinute >= GOVERNOR.offerExpiryMinutes) {
    deck = appendLog(resolveOffer(deck, ctx, "skipped", "expired"), {
      type: "signal",
      atMinute: deck.clock,
      label: "Offer stepped aside unanswered",
      explanation: offer.loopId ? "The agent keeps waiting for your review moment." : "Logged as a skip, with its context — not as a failure.",
    });
    // An unanswered review moment snoozes to the next cadence instead of nagging.
    if (offer.trigger === "review-moment") deck = { ...deck, lastReviewAt: deck.clock };
  }

  const due = deck.clock - deck.lastReviewAt >= ctx.model.reviewEveryMinutes;
  if (!deck.paused && due && deck.reviewSince === null && deck.activeMode !== REVIEW_MODE_ID && deck.offer?.trigger !== "review-moment") {
    const pendingHeld = deck.held.filter((item) => item.until === "review-moment" && item.releasedAtMinute === undefined).length;
    const draft = reviewMomentOffer(deck, ctx, pendingHeld);
    if (!draft) return { ...deck, lastReviewAt: deck.clock }; // nothing waiting: roll the window silently
    if (canPresent(deck, draft)) return presentOffer(deck, ctx, draft, { quiet: true });
  }
  return deck;
}

function accept(deck: DeckState, ctx: DeckContext): DeckState {
  const offer = deck.offer;
  if (!offer) return deck;
  deck = resolveOffer(deck, ctx, "accepted");
  switch (offer.effect) {
    case "close-loop": {
      const loop = deck.loops.find((l) => l.id === offer.loopId);
      deck = { ...deck, loops: closeLoop(deck.loops, offer.loopId ?? "", deck.clock, deck.reviewSince !== null ? "review" : "accepted-offer") };
      deck = appendLog(deck, {
        type: "loop",
        atMinute: deck.clock,
        label: `Open loop closed: ${loop?.label ?? offer.title}`,
        explanation: loop ? `Waited ${formatWait(loopAge(loop, deck.clock))}. Accepted in one tap.` : "Accepted in one tap.",
      });
      return offerNextInReview({ ...deck, note: "Done — straight to the session, nothing in between." }, ctx);
    }
    case "start-review":
      return changeMode({ ...deck, note: "Review moment started — oldest first." }, ctx, REVIEW_MODE_ID, deck.clock);
    case "return-to-mode":
      return changeMode({ ...deck, note: null }, ctx, offer.returnMode ?? deck.previousMode ?? "building", deck.clock);
    case "open-item":
      return appendLog({ ...deck, note: offer.url ? "Pre-loaded — it opened in a new tab." : "Pre-loaded — your next step is the one on screen." }, {
        type: "signal",
        atMinute: deck.clock,
        label: `Accepted: ${offer.microAction}`,
        explanation: "Accepting cost one tap — never more than dismissing (friction asymmetry).",
      });
  }
}

function dismiss(deck: DeckState, ctx: DeckContext): DeckState {
  const offer = deck.offer;
  if (!offer) return deck;
  deck = resolveOffer(deck, ctx, "dismissed");
  deck = { ...deck, governor: recordDismiss(deck.governor, offer.trigger, deck.clock), note: offer.loopId ? "Stepped aside. It'll wait for your review moment." : "Stepped aside." };
  if (offer.trigger === "review-moment" && deck.reviewSince === null) deck = { ...deck, lastReviewAt: deck.clock };
  if (deck.reviewSince !== null && offer.loopId) {
    deck = { ...deck, reviewSkipped: [...deck.reviewSkipped, offer.loopId] };
    return offerNextInReview(deck, ctx);
  }
  return deck;
}

function closeByHand(deck: DeckState, ctx: DeckContext, loopId: string): DeckState {
  const loop = deck.loops.find((l) => l.id === loopId);
  if (!loop || loop.closedAtMinute !== undefined) return deck;
  deck = appendLog({ ...deck, loops: closeLoop(deck.loops, loopId, deck.clock, "answered") }, {
    type: "loop",
    atMinute: deck.clock,
    label: `Open loop closed: ${loop.label}`,
    explanation: `Marked answered after ${formatWait(loopAge(loop, deck.clock))}.`,
  });
  if (deck.offer?.loopId === loopId) deck = { ...deck, offer: null };
  return offerNextInReview(deck, ctx);
}

function togglePause(deck: DeckState, ctx: DeckContext): DeckState {
  const paused = !deck.paused;
  if (paused) deck = resolveOffer(deck, ctx, "skipped", "paused");
  return appendLog({ ...deck, paused }, {
    type: "guard",
    atMinute: deck.clock,
    label: paused ? "Guarding paused" : "Guarding resumed",
    explanation: paused
      ? "FocusDeck steps aside: nothing is batched, held, or offered. The activity log keeps recording."
      : "Back on: your modes and intentions apply again.",
  });
}

function answer(deck: DeckState, response: "yes" | "no" | "skipped"): DeckState {
  const question = deck.pendingQuestion;
  if (!question) return deck;
  return appendLog({ ...deck, pendingQuestion: null }, {
    type: "question",
    atMinute: deck.clock,
    label: response === "skipped" ? "Question skipped" : `You answered: ${response}`,
    explanation: response === "skipped" ? "Skips are signal too. No re-ask today." : "Saved to your model, where you can change it anytime (Declare).",
  });
}

