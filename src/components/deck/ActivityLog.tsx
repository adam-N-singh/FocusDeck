"use client";

import { useState } from "react";
import type { LogEntry, LogType } from "@/lib/focus/deck/state";
import type { NotificationClass } from "@/lib/focus/types";
import { useDeck } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { clockLabel } from "@/lib/client/time";
import { Badge, Disclosure } from "@/components/ui/primitives";

const OUTCOME: Record<NotificationClass, { word: string; tone: "attention" | "accent" | "neutral" }> = {
  "needs-you-now": { word: "Let through", tone: "attention" },
  "batch-for-later": { word: "Held for review", tone: "accent" },
  "suppress-in-mode": { word: "Quiet in this mode", tone: "neutral" },
};

const KIND: Partial<Record<LogType, string>> = {
  mode: "Mode",
  offer: "Offer",
  signal: "Your answer",
  loop: "Waiting",
  review: "Review",
  guard: "Pause",
  question: "Question",
  system: "System",
};

/** How sure the on-device judge was, when it was the one deciding. The explanation says the rest. */
function sureness(entry: LogEntry): string | null {
  if ((entry.source === "jev" || entry.source === "jev-low-confidence") && entry.confidence !== undefined) {
    return `${Math.round(entry.confidence * 100)}% sure`;
  }
  return null;
}

function Line({ entry, label }: { entry: LogEntry; label: boolean | undefined }) {
  const ambiguous = entry.needsUserNow !== undefined && entry.eventId;
  const sure = sureness(entry);
  return (
    <li className="grid grid-cols-[3.25rem_1fr] gap-x-2 py-3">
      <span className="pt-px text-sm text-ink-3 tabular-nums">{clockLabel(entry.atMinute)}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm text-ink">{entry.label}</span>
          {entry.action && <Badge tone={OUTCOME[entry.action].tone}>{OUTCOME[entry.action].word}</Badge>}
          {entry.type !== "event" && KIND[entry.type] && <Badge tone="outline">{KIND[entry.type]}</Badge>}
          {entry.origin === "manual" && <Badge tone="outline">Test</Badge>}
          {sure && <span className="text-xs text-ink-3">{sure}</span>}
        </div>
        <p className="mt-0.5 max-w-[70ch] text-sm leading-6 text-ink-2">{entry.explanation}</p>
        {ambiguous && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
            <span>Did this need you?</span>
            {[true, false].map((needed) => (
              <button
                key={String(needed)}
                type="button"
                aria-pressed={label === needed}
                onClick={() => store.dispatch({ type: "label-event", at: store.now(), eventId: entry.eventId!, needed })}
                className={`h-6 rounded-md px-2 transition-colors ${label === needed ? "bg-accent text-accent-ink" : "text-ink-2 ring-1 ring-line ring-inset hover:text-ink"}`}
              >
                {needed ? "Yes" : "No"}
              </button>
            ))}
            <span className="hidden sm:inline">Your answers check how well FocusDeck judges these.</span>
          </div>
        )}
      </div>
    </li>
  );
}

/** Every decision and why, newest first. Closed until you want it. */
export function ActivityLog() {
  const { deck } = useDeck();
  const [limit, setLimit] = useState(40);
  const entries = [...deck.log].reverse();
  return (
    <Disclosure title="Activity log" meta={entries.length > 0 ? `${entries.length} entries today` : "empty"}>
      {entries.length === 0 ? (
        <p className="text-sm text-ink-2">Nothing yet. Connect a sensor, play a sample day, or send a test moment.</p>
      ) : (
        <ol className="divide-y divide-line">
          {entries.slice(0, limit).map((entry) => (
            <Line key={entry.id} entry={entry} label={entry.eventId ? deck.labels[entry.eventId] : undefined} />
          ))}
        </ol>
      )}
      {entries.length > limit && (
        <button type="button" className="mt-3 text-sm text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink" onClick={() => setLimit((l) => l + 60)}>
          Show {Math.min(60, entries.length - limit)} older
        </button>
      )}
    </Disclosure>
  );
}
