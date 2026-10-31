"use client";

import { useState } from "react";
import type { LogEntry } from "@/lib/focus/deck/state";
import { formatWait } from "@/lib/focus/loops";
import { WARNING_THRESHOLD } from "@/lib/focus/modes";
import { useDeck } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { clockLabel } from "@/lib/client/time";
import { Badge, Panel, Stat } from "@/components/ui/primitives";

/** Today's numbers, mode-relative: a switch inside your mode is work; outside it, it's a leak. */
export function TodayPanel() {
  const { state, view } = useDeck();
  if (!state.hydrated) return null;
  const m = view.metrics;
  const gauge = Math.min(1, view.rollingContextSwitches / WARNING_THRESHOLD);
  return (
    <Panel title="Today" kicker="Mode-relative counting">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Switches" value={m.totalSwitches} hint={`${m.totalSwitches - m.contextSwitches} in-mode · ${m.contextSwitches} context`} />
        <Stat label="Interruptions let through" value={m.interruptions} hint={`${m.attendedInMode} more were the work itself`} />
        <Stat label="Held back for you" value={m.interruptionsAvoided} hint="Batched or held — viewable anytime" />
        <Stat label="Est. refocus cost" value={`${view.lostMinutes}m`} hint="An estimate, not a score" />
        <Stat label="Open-loop minutes" value={formatWait(view.loops.openLoopMinutes)} hint="Agent time spent waiting on you" />
        <Stat label="Longest focus stretch" value={formatWait(m.longestFocusStretchMinutes)} hint="Between context switches and interruptions" />
        <Stat label="Offers" value={view.offers.shown} hint={`${view.offers.accepted} taken · ${view.offers.dismissed} set aside · ${view.offers.skipped} stepped aside`} />
        <div className="rounded-xl bg-zinc-950/60 p-4">
          <p className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">Last hour</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-50 tabular-nums">
            {view.rollingContextSwitches}
            <span className="text-sm font-normal text-zinc-500"> / {WARNING_THRESHOLD}</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800" role="meter" aria-valuemin={0} aria-valuemax={WARNING_THRESHOLD} aria-valuenow={view.rollingContextSwitches} aria-label="Context switches in the last hour">
            <div className={`h-full ${gauge >= 1 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${gauge * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-zinc-500">Context switches. At {WARNING_THRESHOLD}, a supportive nudge — capped.</p>
        </div>
      </div>
    </Panel>
  );
}

const ACTION_TONE = { "needs-you-now": "red", "batch-for-later": "amber", "suppress-in-mode": "zinc" } as const;
const SOURCE_TONE = { rules: "zinc", jev: "violet", "jev-low-confidence": "violet", "safe-default": "sky", paused: "amber" } as const;

function LogLine({ entry, label }: { entry: LogEntry; label: boolean | undefined }) {
  const ambiguous = entry.needsUserNow !== undefined && entry.eventId;
  return (
    <li className="rounded-xl bg-zinc-950/60 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="font-mono text-xs text-zinc-500">{clockLabel(entry.atMinute)}</span>
        <span className="text-zinc-200">{entry.label}</span>
        {entry.action && <Badge tone={ACTION_TONE[entry.action]}>{entry.action}</Badge>}
        {entry.source && (
          <Badge tone={SOURCE_TONE[entry.source]}>
            {entry.source}
            {entry.confidence !== undefined && entry.source !== "rules" && entry.source !== "paused" ? ` · ${entry.confidence.toFixed(2)}` : ""}
          </Badge>
        )}
        {entry.origin === "manual" && <Badge>test</Badge>}
        {entry.type !== "event" && <Badge tone="emerald">{entry.type}</Badge>}
      </div>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{entry.explanation}</p>
      {ambiguous && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>Did this need you? (labels calibrate System One)</span>
          {[true, false].map((needed) => (
            <button
              key={String(needed)}
              type="button"
              aria-pressed={label === needed}
              onClick={() => store.dispatch({ type: "label-event", at: store.now(), eventId: entry.eventId!, needed })}
              className={`rounded-full px-2 py-0.5 ${label === needed ? "bg-zinc-200 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
            >
              {needed ? "Yes" : "No"}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

/**
 * The clear activity log the thread asked for ("a clear activity log before
 * letting it manage notifications automatically"): every event, the rule or
 * model that decided it, and why — newest first.
 */
export function ActivityLog() {
  const { state, deck } = useDeck();
  const [limit, setLimit] = useState(40);
  if (!state.hydrated) return null;
  const entries = [...deck.log].reverse();
  return (
    <Panel title="Activity log" kicker="Every decision, and why">
      {entries.length === 0 ? (
        <p className="text-sm text-zinc-400">Nothing yet. Connect a sensor, start a demo, or try a moment from Sources above.</p>
      ) : (
        <ol className="space-y-2">
          {entries.slice(0, limit).map((entry) => (
            <LogLine key={entry.id} entry={entry} label={entry.eventId ? deck.labels[entry.eventId] : undefined} />
          ))}
        </ol>
      )}
      {entries.length > limit && (
        <button type="button" className="mt-3 text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-200" onClick={() => setLimit((l) => l + 60)}>
          Show older ({entries.length - limit} more)
        </button>
      )}
    </Panel>
  );
}
