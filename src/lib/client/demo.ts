import { reduceDeck } from "../focus/deck/reducer";
import { createDeck, type DeckContext, type DeckState } from "../focus/deck/state";
import { POST_DAY_EVENTS } from "../focus/scenarios";
import { simulateDay } from "../focus/simulator";
import type { AppId, EventKind, ModeId } from "../focus/types";

/**
 * The demo sensor: replays a scripted day into a separate demo deck on a
 * virtual clock, so you can watch the core loop work without any real
 * sensor — and without a single demo event reaching your real mirror.
 */
export type DemoScenario = "x-post" | "simulated";

export interface ScriptEvent {
  atMinute: number;
  kind: EventKind;
  app: AppId;
  label: string;
  /** The mode the script was in, for scenarios that tell a story through mode changes. */
  mode?: ModeId;
}

export interface DemoSession {
  scenario: DemoScenario;
  deck: DeckState;
  script: ScriptEvent[];
  cursor: number;
  simMinute: number;
  startMinute: number;
  endMinute: number;
  /** Simulated minutes per real second. */
  speed: number;
  playing: boolean;
  /** Stop the clock when an offer or question appears, so a person can answer it. */
  pauseOnOffers: boolean;
  followScriptModes: boolean;
  parallelAgents: number;
  seed: number;
  finished: boolean;
}

export const DEMO_START_MINUTE = 9 * 60;

export function demoScript(scenario: DemoScenario, parallelAgents: number, seed: number): ScriptEvent[] {
  if (scenario === "x-post") {
    return POST_DAY_EVENTS.map((e) => ({ atMinute: DEMO_START_MINUTE + e.atMinute, kind: e.kind, app: e.app, label: e.label, mode: e.modeAtEvent }));
  }
  return simulateDay({ seed, parallelAgents, durationMinutes: 480, reviewEveryMinutes: 9999 })
    // The trace's own "switch to the agent" stands in for attending; in the demo, you attend.
    .filter((e) => !e.label.startsWith("Switch to Agent"))
    .map((e) => ({ atMinute: DEMO_START_MINUTE + e.atMinute, kind: e.kind, app: e.app, label: e.label }));
}

export function createDemoSession(options: { scenario: DemoScenario; day: string; parallelAgents?: number; seed?: number; speed?: number; pauseOnOffers?: boolean }): DemoSession {
  const parallelAgents = options.parallelAgents ?? 2;
  const seed = options.seed ?? 42;
  const story = options.scenario === "x-post";
  return {
    scenario: options.scenario,
    deck: createDeck(options.day, DEMO_START_MINUTE, "building"),
    script: demoScript(options.scenario, parallelAgents, seed),
    cursor: 0,
    simMinute: DEMO_START_MINUTE,
    startMinute: DEMO_START_MINUTE,
    endMinute: DEMO_START_MINUTE + (story ? 100 : 480),
    speed: options.speed ?? (story ? 1 : 4),
    playing: true,
    pauseOnOffers: options.pauseOnOffers ?? true,
    followScriptModes: story,
    parallelAgents,
    seed,
    finished: false,
  };
}

const interrupts = (before: DeckState, after: DeckState) =>
  (after.offer !== null && after.offer.id !== before.offer?.id) || (after.pendingQuestion !== null && before.pendingQuestion === null);

/** Advance the virtual clock by `realSeconds`, feeding due script events into the demo deck. */
export function advanceDemo(session: DemoSession, realSeconds: number, ctx: DeckContext): DemoSession {
  if (!session.playing || session.finished) return session;
  const target = Math.min(session.endMinute, session.simMinute + session.speed * realSeconds);
  let deck = session.deck;
  let cursor = session.cursor;
  while (cursor < session.script.length && session.script[cursor].atMinute <= target) {
    const e = session.script[cursor];
    const before = deck;
    if (session.followScriptModes && e.mode && e.mode !== deck.activeMode) deck = reduceDeck(deck, { type: "set-mode", at: e.atMinute, mode: e.mode }, ctx);
    deck = reduceDeck(deck, { type: "event", at: e.atMinute, input: { kind: e.kind, app: e.app, label: e.label, origin: "demo" } }, ctx);
    cursor += 1;
    if (session.pauseOnOffers && interrupts(before, deck)) {
      return { ...session, deck, cursor, simMinute: e.atMinute, playing: false };
    }
  }
  const before = deck;
  deck = reduceDeck(deck, { type: "tick", at: target }, ctx);
  const finished = cursor >= session.script.length && target >= session.endMinute;
  const pause = session.pauseOnOffers && interrupts(before, deck);
  return { ...session, deck, cursor, simMinute: target, playing: !finished && !pause, finished };
}
