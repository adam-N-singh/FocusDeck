"use client";

import { appLabel } from "@/lib/focus/apps";
import { LOOP_AGED_MINUTES, formatWait, loopAge, openLoopsOldestFirst } from "@/lib/focus/loops";
import { useDeck } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { clockLabel } from "@/lib/client/time";
import { CheckIcon } from "@/components/ui/icons";
import { Button, Disclosure, Dot, Group } from "@/components/ui/primitives";

/**
 * Agents blocked on you, oldest first. Holding one back defers it; it never
 * disappears. Its age is shown plainly — information, not a scolding.
 */
export function WaitingList() {
  const { deck, view } = useDeck();
  const open = openLoopsOldestFirst(deck.loops);
  const { closed, meanTimeToCloseMinutes } = view.loops;

  return (
    <section aria-labelledby="waiting-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="waiting-title" className="text-lg font-semibold text-ink">
          Waiting on you
          {open.length > 0 && <span className="ml-2 font-normal text-ink-3 tabular-nums">{open.length}</span>}
        </h2>
      </div>
      {open.length === 0 ? (
        <p className="mt-2 text-sm leading-6 text-ink-2">No agent is waiting on you.</p>
      ) : (
        <Group className="mt-3" label="Agents waiting on you">
          {open.map((loop) => {
            const age = loopAge(loop, deck.clock);
            const aged = age > LOOP_AGED_MINUTES;
            return (
              <li key={loop.id} className="flex items-center gap-3 py-3 pr-2 pl-4">
                <Dot tone={loop.batched ? "muted" : "attention"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink" title={loop.label}>{loop.label}</p>
                  <p className="text-xs leading-5 text-ink-3">
                    {loop.batched ? "Held for your review" : "Needs you now"},{" "}
                    <span className={`tabular-nums ${aged ? "font-medium text-attention" : ""}`}>{age < 1 ? "just now" : `waiting ${formatWait(age)}`}</span>
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => store.dispatch({ type: "close-loop", at: store.now(), loopId: loop.id })}>
                  <CheckIcon />
                  Answered
                </Button>
              </li>
            );
          })}
        </Group>
      )}
      {closed > 0 && (
        <p className="mt-2 text-xs leading-5 text-ink-3">
          {closed} answered today, after {meanTimeToCloseMinutes}m on average.
        </p>
      )}
      {open.some((l) => l.app === "claude-code") && (
        <p className="mt-2 text-xs leading-5 text-ink-3">{appLabel("claude-code")} closes its own entries when you reply, if its connector is set up.</p>
      )}
    </section>
  );
}

/** Notifications and agent finishes held back for later — a count, opened on request. */
export function HeldList() {
  const { deck, view } = useDeck();
  const waiting = deck.held.filter((h) => h.releasedAtMinute === undefined);
  if (waiting.length === 0) return null;
  const forReview = waiting.filter((h) => h.until === "review-moment").length;
  return (
    <section aria-label="Held for later">
      <Disclosure
        title={`${waiting.length} held for later`}
        meta={forReview > 0 ? `review in ${formatWait(view.nextReviewInMinutes)}` : "until you change mode"}
      >
        <ul className="space-y-2">
          {waiting.map((item) => (
            <li key={item.id} className="grid grid-cols-[3.25rem_1fr] gap-2 text-sm">
              <span className="text-ink-3 tabular-nums">{clockLabel(item.atMinute)}</span>
              <span className="text-ink">
                {item.label}
                <span className="text-ink-3">, until {item.until === "review-moment" ? "your review" : "your next mode change"}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-5 text-ink-3">FocusDeck never reads what a notification said, only that one arrived and from which app.</p>
      </Disclosure>
    </section>
  );
}
