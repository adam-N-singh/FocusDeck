import { reduceDeck } from "../focus/deck/reducer";
import { createDeck, type DeckAction, type DeckContext, type DeckState } from "../focus/deck/state";
import { rollOverDeck } from "../focus/deck/summary";
import { generateDemoHistory } from "../focus/demoHistory";
import { hasActivity, summarizeDay, upsertDay, type DayRecord } from "../focus/history";
import { applyAnswer, decideHypothesis, pickQuestion, type Hypothesis } from "../focus/learn";
import { createBlankModel, createDemoModel, normalizeModel, type UserModel } from "../focus/model";
import { toModeMap } from "../focus/modes";
import type { BridgeStats } from "../bridge/store";
import { localDay, minuteOfDay, daysBetween } from "./time";
import { readJson, removeKeys, writeJson, KEYS } from "./persist";
import { createDemoSession, type DemoSession } from "./demo";

/**
 * The browser-side store: one framework-free singleton read through
 * useSyncExternalStore. It owns the live deck (your real day), an optional
 * demo deck (a replayed day that never touches your mirror), your model and
 * your history — all local-first, in this browser's storage.
 */
export interface BridgeStatus {
  enabled: boolean;
  connected: boolean;
  configured: boolean;
  lastSeq: number;
  lastError: string | null;
  stats: BridgeStats | null;
}

export interface AppState {
  hydrated: boolean;
  /** False until you choose the demo model or declare your own. */
  onboarded: boolean;
  /** Only one tab runs the engine; others show a notice. */
  leader: boolean;
  model: UserModel;
  live: DeckState;
  history: DayRecord[];
  demo: DemoSession | null;
  bridge: BridgeStatus;
}

const initial = (): AppState => ({
  hydrated: false,
  onboarded: false,
  leader: true,
  model: createDemoModel(),
  live: createDeck("1970-01-01", 0),
  history: [],
  demo: null,
  bridge: { enabled: true, connected: false, configured: false, lastSeq: 0, lastError: null, stats: null },
});

const SERVER_STATE = initial();
let state: AppState = initial();
const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistNow() {
  if (!state.hydrated || !state.leader) return;
  writeJson(KEYS.model, state.model);
  writeJson(KEYS.live, state.live);
  writeJson(KEYS.history, state.history);
  writeJson(KEYS.onboarded, state.onboarded);
  // The cursor is persisted so a reload never re-ingests events it already processed.
  writeJson(KEYS.bridge, { enabled: state.bridge.enabled, lastSeq: state.bridge.lastSeq });
}

function set(next: AppState) {
  state = next;
  listeners.forEach((listener) => listener());
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 400);
}

/** The reducer's view of you: your model, your modes, and today's one question. */
export function contextFor(model: UserModel, history: DayRecord[], allowQuestions = true): DeckContext {
  return {
    model,
    modes: toModeMap(model.modes),
    nextQuestion: allowQuestions ? (deck, enteringMode) => pickQuestion({ model, deck, enteringMode, history }) : undefined,
  };
}

/** Close out a stale day into history and start today, carrying open loops over. */
function rollIfNeeded(live: DeckState, history: DayRecord[], model: UserModel, now: Date): { live: DeckState; history: DayRecord[] } {
  const today = localDay(now);
  if (live.day === today) return { live, history };
  if (live.day === "1970-01-01") return { live: createDeck(today, minuteOfDay(now)), history };
  const record = summarizeDay(live, toModeMap(model.modes));
  return {
    live: rollOverDeck(live, today, minuteOfDay(now), daysBetween(live.day, today)),
    history: hasActivity(record) ? upsertDay(history, record) : history,
  };
}

export const store = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => state,
  getServerSnapshot: () => SERVER_STATE,
  flush: persistNow,

  /** Load from this browser's storage. Called once by the provider, after mount. */
  hydrate(leader: boolean) {
    const now = new Date();
    const model = normalizeModel(readJson(KEYS.model)) ?? createDemoModel();
    const storedLive = readJson(KEYS.live) as DeckState | null;
    // Merge over fresh defaults so a deck saved by an older build never lacks a field.
    const live = storedLive && storedLive.version === 1 && typeof storedLive.day === "string" && typeof storedLive.clock === "number"
      ? { ...createDeck(storedLive.day, storedLive.clock), ...storedLive }
      : createDeck(localDay(now), minuteOfDay(now));
    const storedHistory = readJson(KEYS.history);
    const history = Array.isArray(storedHistory) ? (storedHistory as DayRecord[]).filter((d) => typeof d?.day === "string") : [];
    const bridgePrefs = readJson(KEYS.bridge) as { enabled?: boolean; lastSeq?: number } | null;
    const rolled = rollIfNeeded(live, history, model, now);
    set({
      ...state,
      hydrated: true,
      leader,
      onboarded: readJson(KEYS.onboarded) === true,
      model,
      ...rolled,
      bridge: {
        ...state.bridge,
        enabled: bridgePrefs?.enabled !== false,
        lastSeq: typeof bridgePrefs?.lastSeq === "number" ? bridgePrefs.lastSeq : state.bridge.lastSeq,
      },
    });
  },

  setLeader(leader: boolean) {
    if (state.leader !== leader) set({ ...state, leader });
  },

  /** Apply an action to whichever deck is on screen: the demo while one runs, else your live day. */
  dispatch(action: DeckAction) {
    if (state.demo) {
      const ctx = contextFor(state.model, state.history);
      set({ ...state, demo: { ...state.demo, deck: reduceDeck(state.demo.deck, action, ctx) } });
    } else store.dispatchLive(action);
  },

  /** Sensor events always land in your live day — the real world keeps going during a demo. */
  dispatchLive(action: DeckAction) {
    set({ ...state, live: reduceDeck(state.live, action, contextFor(state.model, state.history)) });
  },

  /** The clock: tick the live deck and roll the day over at midnight. */
  tick(now = new Date()) {
    const rolled = rollIfNeeded(state.live, state.history, state.model, now);
    const live = reduceDeck(rolled.live, { type: "tick", at: minuteOfDay(now) }, contextFor(state.model, rolled.history));
    set({ ...state, live, history: rolled.history });
  },

  /** The current engine minute for the deck on screen. */
  now(): number {
    return state.demo ? state.demo.simMinute : minuteOfDay(new Date());
  },

  chooseModel(kind: "demo" | "blank") {
    set({ ...state, onboarded: true, model: kind === "demo" ? createDemoModel() : createBlankModel() });
  },

  setModel(model: UserModel) {
    set({ ...state, model, onboarded: true });
  },

  answerQuestion(answer: "yes" | "no" | "skipped") {
    const deck = state.demo?.deck ?? state.live;
    const question = deck.pendingQuestion;
    if (!question) return;
    // In a demo, answers stay in the demo: your real model only changes from your real day.
    const model = state.demo ? state.model : applyAnswer(state.model, question.id, answer, state.live.day);
    set({ ...state, model });
    store.dispatch({ type: "answer-question", at: store.now(), answer });
  },

  decideHypothesis(hypothesis: Hypothesis, confirm: boolean) {
    set({ ...state, model: decideHypothesis(state.model, hypothesis, confirm, state.live.day) });
  },

  setBridge(patch: Partial<BridgeStatus>) {
    set({ ...state, bridge: { ...state.bridge, ...patch } });
  },

  startDemo(options: Omit<Parameters<typeof createDemoSession>[0], "day">) {
    set({ ...state, demo: createDemoSession({ ...options, day: state.live.day }) });
  },

  updateDemo(update: (demo: DemoSession) => DemoSession | null) {
    if (state.demo) set({ ...state, demo: update(state.demo) });
  },

  stopDemo() {
    set({ ...state, demo: null });
  },

  loadDemoHistory() {
    const real = state.history.filter((d) => !d.demo);
    const realDays = new Set(real.map((d) => d.day));
    const demo = generateDemoHistory(state.live.day).filter((d) => !realDays.has(d.day));
    set({ ...state, history: [...real, ...demo].sort((a, b) => a.day.localeCompare(b.day)) });
  },

  clearDemoHistory() {
    set({ ...state, history: state.history.filter((d) => !d.demo) });
  },

  exportData(): string {
    return JSON.stringify({ app: "FocusDeck", exportedAt: new Date().toISOString(), model: state.model, today: state.live, history: state.history }, null, 2);
  },

  /** Import a model and history from an export. Today's deck always starts fresh. */
  importData(json: string): string | null {
    try {
      const data = JSON.parse(json) as { model?: unknown; history?: unknown };
      const model = normalizeModel(data.model);
      if (!model) return "That file doesn't contain a FocusDeck model.";
      const history = Array.isArray(data.history) ? (data.history as DayRecord[]).filter((d) => typeof d?.day === "string") : [];
      set({ ...state, model, history, onboarded: true });
      return null;
    } catch {
      return "That file isn't valid JSON.";
    }
  },

  deleteEverything() {
    removeKeys();
    const now = new Date();
    set({ ...initial(), hydrated: true, leader: state.leader, live: createDeck(localDay(now), minuteOfDay(now)), model: createBlankModel() });
  },
};
