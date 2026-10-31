"use client";

import { appLabel } from "@/lib/focus/apps";
import { LOOP_AGED_MINUTES, formatWait, loopAge, openLoopsOldestFirst } from "@/lib/focus/loops";
import { useDeck } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { clockLabel } from "@/lib/client/time";
import { Badge, Button, Panel } from "@/components/ui/primitives";

/**
 * Open loops — agents blocked on you, as an ageable queue. Batching defers a
 * loop but never deletes it; its age is the headline number (README next
 * step 2), counted plainly and never used to shame.
 */
export function OpenLoopsPanel() {
  const { state, deck, view } = useDeck();
  if (!state.hydrated) return null;
  const open = openLoopsOldestFirst(deck.loops);
  const loops = view.loops;
  return (
    <Panel title="Open loops" kicker="Agents waiting on you">
      <p className="text-sm text-zinc-400">
        {open.length === 0 ? "No agent is waiting on you." : `${open.length} open · oldest ${formatWait(loops.oldestOpenMinutes)}`}
        {loops.closed > 0 ? ` · ${loops.closed} closed today · mean wait ${loops.meanTimeToCloseMinutes}m` : ""}
      </p>
      {open.length > 0 && (
        <ul className="mt-3 space-y-2">
          {open.map((loop) => {
            const age = loopAge(loop, deck.clock);
            return (
              <li key={loop.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-zinc-950/60 px-3 py-2">
                <span className="min-w-0 flex-1 text-sm text-zinc-200">{loop.label}</span>
                <Badge tone={age > LOOP_AGED_MINUTES ? "amber" : "zinc"}>waiting {formatWait(age)}</Badge>
                <Badge tone={loop.batched ? "sky" : "red"}>{loop.batched ? "held for review" : "surfaced now"}</Badge>
                <Button size="sm" onClick={() => store.dispatch({ type: "close-loop", at: store.now(), loopId: loop.id })}>
                  Answered
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-zinc-500">
        {appLabel("claude-code")} sessions close their own loops when you reply, if the Claude Code sensor is installed.
      </p>
    </Panel>
  );
}

/** Held for you: an offer deferred, viewable anytime — never a wall. */
export function HeldPanel() {
  const { state, deck } = useDeck();
  if (!state.hydrated) return null;
  const waiting = deck.held.filter((h) => h.releasedAtMinute === undefined);
  const ready = deck.held.filter((h) => h.releasedAtMinute !== undefined && !h.acknowledged);
  return (
    <Panel
      title="Held for you"
      kicker="Never hidden"
      actions={ready.length > 0 ? <Button size="sm" onClick={() => store.dispatch({ type: "acknowledge-released", at: store.now() })}>Got it</Button> : undefined}
    >
      {ready.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium tracking-wide text-emerald-300 uppercase">Ready for you now</p>
          <ul className="mt-2 space-y-1.5">
            {ready.map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="font-mono text-xs text-zinc-500">{clockLabel(item.atMinute)}</span>
                <span className="text-zinc-200">{item.label}</span>
                <span className="text-xs text-zinc-500">released at your {item.releasedBy === "review-moment" ? "review moment" : "mode change"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {waiting.length === 0 ? (
        <p className="text-sm text-zinc-400">Nothing held right now.</p>
      ) : (
        <ul className="space-y-1.5">
          {waiting.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="font-mono text-xs text-zinc-500">{clockLabel(item.atMinute)}</span>
              <span className="text-zinc-300">{item.label}</span>
              <Badge tone={item.until === "review-moment" ? "sky" : "zinc"}>
                {item.until === "review-moment" ? "until your review moment" : "until your next mode change"}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-zinc-500">FocusDeck never reads what a notification said — only that one arrived, from which app.</p>
    </Panel>
  );
}
