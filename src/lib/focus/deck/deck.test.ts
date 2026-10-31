import { describe, expect, it } from "vitest";
import { createDemoModel, type UserModel } from "../model";
import { toModeMap } from "../modes";
import type { AppId, EventKind } from "../types";
import { reduceDeck } from "./reducer";
import { createDeck, type DeckAction, type DeckContext, type DeckState } from "./state";
import { deckView, rollOverDeck } from "./summary";

const contextFor = (model: UserModel = createDemoModel(), extra: Partial<DeckContext> = {}): DeckContext => ({
  model,
  modes: toModeMap(model.modes),
  ...extra,
});

const run = (deck: DeckState, ctx: DeckContext, ...actions: DeckAction[]) => actions.reduce((d, a) => reduceDeck(d, a, ctx), deck);
const ev = (at: number, kind: EventKind, app: AppId, source?: string): DeckAction => ({ type: "event", at, input: { kind, app, source } });
const day = (mode = "building") => createDeck("2026-10-31", 540, mode);

describe("deck: interruption moments", () => {
  it("batches a blocked agent in Writing as an open loop — never suppressed, no offer", () => {
    const deck = run(day("writing"), contextFor(), ev(545, "agent-needs-input", "claude-code"));
    expect(deck.loops).toHaveLength(1);
    expect(deck.loops[0].batched).toBe(true);
    expect(deck.offer).toBeNull();
    expect(deck.log.at(-1)?.action).toBe("batch-for-later");
  });

  it("lets a blocked agent interrupt Building as one offer; accepting closes the loop", () => {
    const ctx = contextFor();
    const offered = run(day(), ctx, ev(545, "agent-needs-input", "claude-code"));
    expect(offered.offer?.trigger).toBe("interruption");
    expect(offered.offer?.effect).toBe("close-loop");
    const accepted = run(offered, ctx, { type: "accept-offer", at: 546 });
    expect(accepted.loops[0].closedBy).toBe("accepted-offer");
    expect(accepted.signals.at(-1)?.response).toBe("accepted");
  });

  it("dismissing an interruption keeps the agent waiting, batched for the review moment", () => {
    const ctx = contextFor();
    const deck = run(day(), ctx, ev(545, "agent-needs-input", "claude-code"), { type: "dismiss-offer", at: 546 });
    expect(deck.loops[0].closedAtMinute).toBeUndefined();
    expect(deck.loops[0].batched).toBe(true);
    expect(deck.note).toMatch(/review moment/);
    expect(deck.note).not.toMatch(/sorry|should|missed|fail/i); // dismiss is sacred: no guilt copy
  });

  it("honours a 'batch' intention verbatim, and holds the item for the review moment", () => {
    const deck = run(day(), contextFor(), ev(545, "agent-finished", "terminal"));
    expect(deck.log.at(-1)?.explanation).toContain("You said: “When an agent finishes while I'm building");
    expect(deck.held[0].until).toBe("review-moment");
  });

  it("holds a Slack ping in Building until the next mode change, then releases it", () => {
    const ctx = contextFor();
    const held = run(day(), ctx, ev(545, "notification", "slack"));
    expect(held.held[0].until).toBe("mode-change");
    const released = run(held, ctx, { type: "set-mode", at: 560, mode: "writing" });
    expect(released.held[0].releasedBy).toBe("mode-change");
  });
});

describe("deck: defection moments", () => {
  it("offers your own intention, verbatim, when you open X during Building — scoped to the mode", () => {
    const deck = run(day(), contextFor(), ev(545, "app-switch", "browser-x"));
    expect(deck.offer?.trigger).toBe("defection");
    expect(deck.offer?.said).toBe("When I open X during Building, show me my PR queue.");
    expect(deck.offer?.title).toBe("Review PR #42");
    expect(deck.offer?.trace).toMatch(/fits Building/);
  });

  it("does not treat X as a defection in Comms, where you chose to be reachable", () => {
    const deck = run(day("comms"), contextFor(), ev(545, "app-switch", "browser-x"));
    expect(deck.offer).toBeNull();
  });

  it("offers an early review instead of a leak when agents are waiting in a protected mode", () => {
    const deck = run(day("writing"), contextFor(), ev(545, "agent-needs-input", "claude-code"), ev(550, "app-switch", "browser-x"));
    expect(deck.offer?.effect).toBe("start-review");
    expect(deck.offer?.said).toMatch(/offer me the next thing on my list/);
  });

  it("honours the asked-for kind over the default order, picking the item that fits the mode", () => {
    // "When I reach for Slack while writing, show me what I said I'd write." → pinned intentions, scoped to Writing.
    const deck = run(day("writing"), contextFor(), ev(545, "agent-needs-input", "claude-code"), ev(550, "app-switch", "slack"));
    expect(deck.offer?.title).toBe("Write the migration notes");
    expect(deck.offer?.said).toBe("When I reach for Slack while writing, show me what I said I'd write.");
  });

  it("stays quiet during the cool-off after a dismiss — no re-ask", () => {
    const ctx = contextFor();
    const deck = run(day(), ctx,
      ev(545, "app-switch", "browser-x"),
      { type: "dismiss-offer", at: 546 },
      ev(548, "app-switch", "editor"),
      ev(550, "app-switch", "browser-x"),
    );
    expect(deck.offer).toBeNull();
    expect(deck.log.some((l) => l.label === "Stayed quiet")).toBe(true);
    expect(deck.signals.filter((s) => s.response === "dismissed")).toHaveLength(1);
  });

  it("lets an unanswered offer step aside after a few minutes, logged as a skip with context", () => {
    const deck = run(day(), contextFor(), ev(545, "app-switch", "browser-x"), { type: "tick", at: 551 });
    expect(deck.offer).toBeNull();
    const skip = deck.signals.at(-1);
    expect(skip?.response).toBe("skipped");
    expect(skip?.context.skipReason).toBe("expired");
    expect(skip?.context.minutesInMode).toBeGreaterThan(0);
  });
});

describe("deck: review moments (mode-transition trigger)", () => {
  it("walks open loops oldest first, then offers the way back", () => {
    const ctx = contextFor();
    let deck = run(day("writing"), ctx,
      ev(545, "agent-needs-input", "claude-code", "aaa111"),
      ev(560, "agent-needs-input", "cursor-agent", "bbb222"),
      { type: "tick", at: 541 + 60 },
    );
    expect(deck.offer?.trigger).toBe("review-moment");
    deck = run(deck, ctx, { type: "accept-offer", at: 602 });
    expect(deck.activeMode).toBe("reviewing-agents");
    expect(deck.offer?.loopId).toBe(deck.loops[0].id); // the oldest
    deck = run(deck, ctx, { type: "accept-offer", at: 604 });
    expect(deck.offer?.loopId).toBe(deck.loops[1].id);
    deck = run(deck, ctx, { type: "accept-offer", at: 606 });
    expect(deck.offer?.effect).toBe("return-to-mode");
    deck = run(deck, ctx, { type: "accept-offer", at: 607 });
    expect(deck.activeMode).toBe("writing");
    expect(deck.loops.every((l) => l.closedBy === "review")).toBe(true);
    expect(deck.log.some((l) => l.label === "Review moment ended" && /Cleared 2/.test(l.explanation))).toBe(true);
  });

  it("rolls the review window silently when nothing is waiting", () => {
    const deck = run(day(), contextFor(), { type: "tick", at: 600 });
    expect(deck.offer).toBeNull();
    expect(deck.lastReviewAt).toBe(600);
  });
});

describe("deck: trust controls", () => {
  it("pause steps aside: events pass through and are logged, nothing is held or offered", () => {
    const ctx = contextFor();
    const deck = run(day(), ctx, { type: "toggle-pause", at: 541 }, ev(545, "notification", "slack"), ev(546, "app-switch", "browser-x"), ev(547, "agent-needs-input", "claude-code"));
    expect(deck.held).toHaveLength(0);
    expect(deck.offer).toBeNull();
    expect(deck.loops).toHaveLength(1); // the agent is still waiting on you — that's a fact, not guarding
    expect(deck.log.filter((l) => l.source === "paused")).toHaveLength(2);
  });

  it("cannot see an app you haven't designated", () => {
    const model = { ...createDemoModel(), designatedApps: ["editor" as AppId] };
    const deck = run(day(), contextFor(model), ev(545, "app-switch", "browser-x"), ev(546, "notification", "slack"));
    expect(deck.events).toHaveLength(0);
    expect(deck.log).toHaveLength(0);
  });

  it("closes the right loop when a sensor reports the agent resumed", () => {
    const ctx = contextFor();
    const deck = run(day("writing"), ctx,
      ev(545, "agent-needs-input", "claude-code", "aaa111"),
      ev(546, "agent-needs-input", "claude-code", "bbb222"),
      { type: "agent-resumed", at: 550, app: "claude-code", source: "bbb222" },
    );
    expect(deck.loops.find((l) => l.source === "bbb222")?.closedBy).toBe("agent-resumed");
    expect(deck.loops.find((l) => l.source === "aaa111")?.closedAtMinute).toBeUndefined();
  });

  it("stays quiet in the first build hour once you've asked it to", () => {
    const model = { ...createDemoModel(), quietFirstBuildHour: true };
    const deck = run(day(), contextFor(model), ev(560, "agent-needs-input", "claude-code"));
    expect(deck.offer).toBeNull();
    expect(deck.loops[0].batched).toBe(true);
    expect(deck.log.at(-1)?.explanation).toMatch(/first build hour/);
  });

  it("asks at most one boundary question a day, only at a mode change", () => {
    const ctx = contextFor(createDemoModel(), { nextQuestion: () => ({ id: "q", text: "Quiet first hour?" }) });
    let deck = run(day(), ctx, ev(545, "app-switch", "editor"));
    expect(deck.pendingQuestion).toBeNull();
    deck = run(deck, ctx, { type: "set-mode", at: 550, mode: "writing" });
    expect(deck.pendingQuestion?.id).toBe("q");
    deck = run(deck, ctx, { type: "answer-question", at: 551, answer: "yes" }, { type: "set-mode", at: 560, mode: "building" });
    expect(deck.pendingQuestion).toBeNull();
  });
});

describe("deck: the Hymah-ified 20-switch warning", () => {
  it("fires once when context switches cross 20 in an hour, and is capped", () => {
    const ctx = contextFor({ ...createDemoModel(), trapApps: [] });
    const actions: DeckAction[] = [];
    for (let i = 0; i < 30; i++) actions.push(ev(541 + i * 1.5, "app-switch", i % 2 === 0 ? "slack" : "calendar"));
    const deck = run(day(), ctx, ...actions);
    expect(deck.offer?.trigger).toBe("warning");
    expect(deck.offer?.title).toMatch(/context switches in this building hour/);
    expect(deck.governor.warningTimes).toHaveLength(1);
  });
});

describe("deck summary", () => {
  it("counts with the deck's own decisions and ages loops", () => {
    const ctx = contextFor();
    const deck = run(day("writing"), ctx, ev(545, "agent-needs-input", "claude-code"), { type: "tick", at: 575 });
    const view = deckView(deck, ctx.model, ctx.modes);
    expect(view.metrics.openLoops).toBe(1);
    expect(view.loops.oldestOpenMinutes).toBe(30);
  });

  it("carries open loops into a new day with their age intact", () => {
    const ctx = contextFor();
    const deck = run(day("writing"), ctx, ev(1430, "agent-needs-input", "claude-code"));
    const next = rollOverDeck(deck, "2026-11-01", 10);
    expect(next.loops).toHaveLength(1);
    expect(next.clock - next.loops[0].openedAtMinute).toBe(20);
  });
});
