"use client";

import { REVIEW_MODE_ID, resolveMode } from "@/lib/focus/modes";
import { formatWait } from "@/lib/focus/loops";
import { useDeck } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { PlayIcon } from "@/components/ui/icons";
import { hueProps, modeTint } from "@/components/ui/modeColor";
import { Button, Kbd } from "@/components/ui/primitives";
import { homeApps, modeRuleSentence } from "./modeRule";

/**
 * The first thing on the screen is where you are: the mode's name, in the
 * mode's own colour, how long you've been in it, and what it lets through.
 * Every preset shows its own hue, so the switcher previews the room.
 */
export function ModeHero() {
  const { state, deck, modes, view } = useDeck();
  const mode = resolveMode(modes, deck.activeMode);
  const minutes = deck.clock - deck.modeSince;
  const inReview = deck.activeMode === REVIEW_MODE_ID;
  const plans = state.model.intentions.filter((i) => i.enabled && i.mode === mode.id).length;
  const setMode = (id: string) => store.dispatch({ type: "set-mode", at: store.now(), mode: id });

  return (
    <section aria-labelledby="mode-name">
      <h1 id="mode-name" className="text-5xl leading-[1.05] font-semibold tracking-tight text-accent sm:text-6xl">
        <span className="sr-only">Now: </span>
        {deck.paused ? "Paused" : mode.label}
      </h1>

      {deck.paused ? (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <p className="max-w-[52ch] text-base leading-7 text-ink-2">
            You were in {mode.label}. While paused nothing is held back or offered; the activity log still records everything.
          </p>
          <Button variant="primary" onClick={() => store.dispatch({ type: "toggle-pause", at: store.now() })}>
            <PlayIcon />
            Resume
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-base text-ink-2">
          <span className="tabular-nums">{formatWait(minutes)} in this mode</span>
          {!inReview && (
            <span className="inline-flex items-center gap-3">
              <span className="tabular-nums">Review in {formatWait(view.nextReviewInMinutes)}</span>
              <Button size="sm" variant="ghost" className="-ml-1" onClick={() => store.dispatch({ type: "start-review", at: store.now() })}>
                Review now
              </Button>
            </span>
          )}
        </div>
      )}

      <div role="group" aria-label="Switch mode" className="mt-7 flex flex-wrap gap-2">
        {state.model.modes.map((m, i) => {
          const active = m.id === deck.activeMode;
          return (
            <button
              key={m.id}
              type="button"
              {...hueProps(modeTint(state.model.modes, m.id))}
              aria-pressed={active}
              title={i < 9 ? `Switch to ${m.label} (${i + 1})` : `Switch to ${m.label}`}
              onClick={() => setMode(m.id)}
              className={`inline-flex h-10 items-center gap-2.5 rounded-full border pr-2 pl-3.5 text-sm transition-colors ${
                active ? "border-accent-line bg-accent-soft font-medium text-ink" : "border-line text-ink-2 hover:border-accent-line hover:text-ink"
              }`}
            >
              <span aria-hidden className="size-2.5 rounded-full bg-accent" />
              {m.label}
              {i < 9 ? <Kbd>{i + 1}</Kbd> : <span className="w-1" />}
            </button>
          );
        })}
      </div>

      {!deck.paused && (
        <div className="mt-5 max-w-[62ch] space-y-1">
          <p className="text-base leading-7 text-ink">{modeRuleSentence(mode)}</p>
          <p className="text-sm leading-6 text-ink-3">
            Belongs here: {homeApps(mode)}.
            {plans > 0 && ` ${plans} of your if-then plans ${plans === 1 ? "applies" : "apply"} here.`}
          </p>
        </div>
      )}
    </section>
  );
}
