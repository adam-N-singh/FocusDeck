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
