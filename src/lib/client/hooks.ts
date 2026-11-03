"use client";

import { useMemo, useSyncExternalStore } from "react";
import { deckView } from "../focus/deck/summary";
import { toModeMap } from "../focus/modes";
import { store, type AppState } from "./store";

/** The whole app state. The server snapshot is a fixed, clock-free default, so hydration never mismatches. */
export function useAppState(): AppState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

/** The deck on screen: the demo while one runs, otherwise your live day. */
export function useDeck() {
  const state = useAppState();
  const deck = state.demo?.deck ?? state.live;
  const modes = useMemo(() => toModeMap(state.model.modes), [state.model.modes]);
  const view = useMemo(() => deckView(deck, state.model, modes), [deck, state.model, modes]);
  return { state, deck, modes, view, isDemo: state.demo !== null };
}

// A shared wall clock for relative times ("3 min ago"). Ticks every 10 s while
// anything is listening; the server snapshot is 0, so nothing time-dependent
// renders on the server (the server's clock is not yours).
let nowValue = 0;
let nowTimer: ReturnType<typeof setInterval> | null = null;
const nowListeners = new Set<() => void>();

function subscribeNow(listener: () => void) {
  nowListeners.add(listener);
  if (nowTimer === null) {
    nowValue = Date.now();
    nowTimer = setInterval(() => {
      nowValue = Date.now();
      nowListeners.forEach((l) => l());
    }, 10_000);
  }
  return () => {
    nowListeners.delete(listener);
    if (nowListeners.size === 0 && nowTimer !== null) {
      clearInterval(nowTimer);
      nowTimer = null;
    }
  };
}

export function useNow(): number {
  return useSyncExternalStore(subscribeNow, () => nowValue, () => 0);
}

/** "just now", "4 min ago", "2 h ago", "3 days ago". */
export function ago(then: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

