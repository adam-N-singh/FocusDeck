"use client";

import { REVIEW_MODE_ID, describeModeRule, resolveMode } from "@/lib/focus/modes";
import { formatWait } from "@/lib/focus/loops";
import { useDeck } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { Button, Panel } from "@/components/ui/primitives";

/**
 * The mode dock — the borrowed idea from the quoted post ("an AI-native dock
 * with custom modes"), with the thread's safety controls built in: a
 * one-click pause and a plain-English rule for what each mode lets through.
 * Modes are yours: they come from your declared model, not a fixed list.
 */
export function LiveModeDock() {
  const { state, deck, modes, view } = useDeck();
  if (!state.hydrated) return null;
  const mode = resolveMode(modes, deck.activeMode);
  const now = deck.clock;
  const scoped = state.model.intentions.filter((i) => i.enabled && i.mode === mode.id).length;
  const setMode = (id: string) => store.dispatch({ type: "set-mode", at: store.now(), mode: id });

  return (
    <Panel
      title="Mode dock"
      actions={
        <>
          {deck.activeMode !== REVIEW_MODE_ID && (
            <Button size="sm" onClick={() => store.dispatch({ type: "start-review", at: store.now() })}>
              Start a review moment
            </Button>
          )}
          <Button
            size="sm"
            variant={deck.paused ? "primary" : "secondary"}
            aria-pressed={deck.paused}
            onClick={() => store.dispatch({ type: "toggle-pause", at: store.now() })}
          >
            {deck.paused ? "Paused — resume guarding" : "Pause guarding"}
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2" role="group" aria-label="Modes">
        {state.model.modes.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={m.id === deck.activeMode}
            onClick={() => setMode(m.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              m.id === deck.activeMode ? "bg-emerald-400 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {deck.paused ? (
        <p className="mt-3 text-sm leading-6 text-amber-200/90">
          Guarding is paused: nothing is batched, held, or offered. The activity log still records everything.
        </p>
      ) : (
        <div className="mt-3 space-y-1 text-sm leading-6">
          <p className="text-zinc-300">{mode.description}</p>
          <p className="text-zinc-500">{describeModeRule(mode)}</p>
        </div>
      )}
      <p className="mt-2 text-xs text-zinc-500">
        In {mode.label} for {formatWait(now - deck.modeSince)}
        {scoped > 0 ? ` · ${scoped} of your intentions apply here` : ""}
        {deck.activeMode !== REVIEW_MODE_ID ? ` · next review moment in ${formatWait(view.nextReviewInMinutes)}` : ""}
      </p>
    </Panel>
  );
}
