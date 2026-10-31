import { appLabel } from "../apps";
import { TARGET_KINDS, matchIntention, type ImplementationIntention, type OfferTarget } from "../intentions";
import { formatWait, loopAge, openLoopsOldestFirst, type OpenLoop } from "../loops";
import { resolveMode } from "../modes";
import { selectOffer, type QueueItem, type QueueItemKind } from "../offer";
import type { AppId, ModeId } from "../types";
import type { DeckContext, DeckState, Offer } from "./state";

/**
 * Offer builders — three triggers (defection, interruption, mode transition),
 * one offer engine. Every offer is exactly one thing, traced to the user's own
 * model, framed as the smallest next step, in their own words where possible.
 * Builders are pure and return offers without ids; the reducer assigns them.
 */
export type OfferDraft = Omit<Offer, "id" | "atMinute" | "mode">;

const modeLabel = (ctx: DeckContext, id: ModeId) => resolveMode(ctx.modes, id).label;

const KIND_LABELS: Record<QueueItemKind, string> = {
  "blocked-agent": "a blocked agent",
  task: "a task",
  intention: "a pinned intention",
  "content-chunk": "something short to read",
  interest: "a declared interest",
};

/** Items offered or answered in the last hour step back so the same thing isn't re-asked. */
function recentlySeen(deck: DeckState): Set<string> {
  return new Set(deck.signals.filter((s) => s.itemId && s.atMinute > deck.clock - 60).map((s) => s.itemId as string));
}

const fitsMode = (ctx: DeckContext, mode: ModeId, app?: AppId) =>
  app === undefined || resolveMode(ctx.modes, mode).allowedApps.includes(app);

export function loopOfferDraft(deck: DeckState, ctx: DeckContext, loop: OpenLoop, trigger: Offer["trigger"], said?: ImplementationIntention | null): OfferDraft {
  const waited = loopAge(loop, deck.clock);
  return {
    trigger,
    title: waited >= 1 ? `${loop.label} — waiting ${formatWait(waited)}` : loop.label,
    microAction: "Open the session and answer",
    estimatedMinutes: 2,
    said: said?.text,
    intentionId: said?.id,
    loopId: loop.id,
    itemKind: "blocked-agent",
    effect: "close-loop",
    trace:
      trigger === "interruption"
        ? `${modeLabel(ctx, deck.activeMode)} lets an agent blocked on you interrupt — that's your rule, so it came straight through.`
        : "Oldest first: the agent that has waited longest on you goes first.",
  };
}

function itemOfferDraft(item: QueueItem, trigger: Offer["trigger"], trace: string, intention: ImplementationIntention | null): OfferDraft {
  return {
    trigger,
    title: item.title,
    microAction: item.microAction,
    estimatedMinutes: item.estimatedMinutes,
    url: item.url,
    said: intention?.text,
    intentionId: intention?.id,
    itemId: item.id,
    itemKind: item.kind,
    effect: "open-item",
    trace,
  };
}

/**
 * Choose what to offer for a target, scoped to the active mode. Blocked agents
 * come first (the twist's new top tier). If the mode doesn't let agents
 * interrupt, the honest offer is an early review moment rather than a leak.
 */
function draftForTarget(deck: DeckState, ctx: DeckContext, target: OfferTarget, trigger: Offer["trigger"], intention: ImplementationIntention | null): OfferDraft | null {
  if (target === "batch") return null;
  const mode = resolveMode(ctx.modes, deck.activeMode);
  const kinds = TARGET_KINDS[target];
  const loops = openLoopsOldestFirst(deck.loops);
  const opening = intention ? `Matched your intention, so this is what you asked for.` : `No intention matched this moment, so Hymah's order applies (blocked agents → tasks → intentions → content → interests).`;

  if ((kinds === null || kinds.includes("blocked-agent")) && loops.length > 0) {
    if (mode.interruptibleBy.includes("agent-needs-input")) {
      const draft = loopOfferDraft(deck, ctx, loops[0], trigger, intention);
      return { ...draft, trace: `${opening} An agent blocked on you outranks your own list, and ${mode.label} lets agents through.` };
    }
    const oldest = loopAge(loops[0], deck.clock);
    return {
      trigger,
      title: `${loops.length} agent${loops.length === 1 ? " is" : "s are"} waiting on you — oldest ${formatWait(oldest)}`,
      microAction: "Review them now instead",
      said: intention?.text,
      intentionId: intention?.id,
      effect: "start-review",
      trace: `${opening} ${mode.label} holds blocked agents, so instead of a leak this is a deliberate review moment.`,
    };
  }

  const seen = recentlySeen(deck);
  const pool = ctx.model.queue.filter((item) => kinds === null || kinds.includes(item.kind));
  const fresh = pool.filter((item) => !seen.has(item.id));
  const candidates = fresh.length > 0 ? fresh : pool;
  const inMode = candidates.filter((item) => fitsMode(ctx, deck.activeMode, item.app));
  const chosen = selectOffer(inMode.length > 0 ? inMode : candidates);
  if (!chosen) {
    // Nothing of the asked-for kind: fall back to the whole list rather than invent anything.
    return target === "queue-top" ? null : draftForTarget(deck, ctx, "queue-top", trigger, intention);
  }
  const where = chosen.app ? ` It happens in ${appLabel(chosen.app)}` : "";
  const scope = inMode.length > 0
    ? `${where}${where ? ", which" : " It"} fits ${mode.label}, so taking it isn't another context switch.`
    : ` Nothing on your list fits ${mode.label}, so this is from your whole list.`;
  return itemOfferDraft(chosen, trigger, `${opening} From your queue: ${KIND_LABELS[chosen.kind]}, priority ${chosen.priority}.${scope}`, intention);
}

/** Defection moment: a trap app opened outside its mode (Hymah's original trigger). */
export function defectionOffer(deck: DeckState, ctx: DeckContext, app: AppId): OfferDraft | null {
  const intention = matchIntention(ctx.model.intentions, { when: "opens-trap", mode: deck.activeMode, app });
  if (intention?.then === "batch") return null;
  const draft = draftForTarget(deck, ctx, intention?.then ?? "queue-top", "defection", intention);
  return draft ? { ...draft, trapApp: app, detail: `You opened ${appLabel(app)} — it's still right there. This is just the thing you said you'd rather do.` } : null;
}

/** Mode transition: an intention for entering this mode ("When I start Writing, show me…"). */
export function enterModeOffer(deck: DeckState, ctx: DeckContext): OfferDraft | null {
  const intention = matchIntention(ctx.model.intentions, { when: "enters-mode", mode: deck.activeMode });
  if (!intention) return null;
  return draftForTarget(deck, ctx, intention.then, "mode-transition", intention);
}

/** The scheduled intent moment, promoted: your review cadence arriving. */
export function reviewMomentOffer(deck: DeckState, ctx: DeckContext, pendingHeld: number): OfferDraft | null {
  const loops = openLoopsOldestFirst(deck.loops);
  if (loops.length === 0 && pendingHeld === 0) return null;
  const intention = matchIntention(ctx.model.intentions, { when: "review-moment", mode: deck.activeMode });
  const parts: string[] = [];
  if (loops.length > 0) parts.push(`${loops.length} agent${loops.length === 1 ? "" : "s"} waiting (oldest ${formatWait(loopAge(loops[0], deck.clock))})`);
  if (pendingHeld > 0) parts.push(`${pendingHeld} held item${pendingHeld === 1 ? "" : "s"}`);
  return {
    trigger: "review-moment",
    title: `Review moment — ${parts.join(" · ")}`,
    microAction: "Start review",
    said: intention?.text,
    intentionId: intention?.id,
    effect: "start-review",
    trace: `You set a review moment every ${ctx.model.reviewEveryMinutes} minutes. Batched things wait here instead of pinging you.`,
  };
}

/** The 20-switch warning, Hymah-ified: supportive, mode-relative, capped, never shaming. */
export function warningOffer(deck: DeckState, ctx: DeckContext, count: number): OfferDraft {
  return {
    trigger: "warning",
    title: `${count} context switches in this ${modeLabel(ctx, deck.activeMode).toLowerCase()} hour`,
    microAction: "Take a review moment",
    detail: "That's a lot of pulls in different directions. A short review can clear whatever keeps tugging at you.",
    effect: "start-review",
    trace: "Counted over a rolling hour, relative to the mode you were in at each switch. Shown at most once an hour and three times a day.",
  };
}

/** After a review moment empties the queue: a one-tap way back. */
export function returnOffer(deck: DeckState, ctx: DeckContext, cleared: number): OfferDraft | null {
  if (!deck.previousMode) return null;
  return {
    trigger: "mode-transition",
    title: cleared > 0 ? `All caught up — ${cleared} cleared` : "Nothing else is waiting",
    microAction: `Back to ${modeLabel(ctx, deck.previousMode)}`,
    effect: "return-to-mode",
    returnMode: deck.previousMode,
    trace: "Review moments end on their own once nothing is waiting.",
  };
}
