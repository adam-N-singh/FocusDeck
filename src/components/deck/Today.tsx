"use client";

import type { ReactNode } from "react";
import { GOVERNOR } from "@/lib/focus/governor";
import { formatWait } from "@/lib/focus/loops";
import { WARNING_THRESHOLD } from "@/lib/focus/modes";
import { useDeck } from "@/lib/client/hooks";
import { Disclosure, Meter } from "@/components/ui/primitives";

function Figure({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-ink tabular-nums">{value}</dd>
      {note && <dd className="mt-0.5 text-xs leading-5 text-ink-3">{note}</dd>}
    </div>
  );
}

/**
 * Today, counted relative to your mode: a switch between apps that belong to
 * the mode is the work; a switch outside it is a leak. Four numbers up front,
 * the rest one click away.
 */
export function TodayStrip() {
  const { view } = useDeck();
  const m = view.metrics;
  const rolling = view.rollingContextSwitches;
  const near = rolling >= WARNING_THRESHOLD * 0.75;

  return (
    <section aria-labelledby="today-title" className="border-t border-line pt-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 id="today-title" className="text-lg font-semibold text-ink">Today</h2>
        <div className="w-full max-w-xs">
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="text-ink-2">Switches outside your mode, last hour</span>
            <span className={`tabular-nums ${near ? "font-medium text-attention" : "text-ink"}`}>
              {rolling}/{WARNING_THRESHOLD}
            </span>
          </div>
          <Meter value={rolling} max={WARNING_THRESHOLD} alert={near} label="Switches outside your mode in the last hour" />
        </div>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
        <Figure label="App switches" value={m.totalSwitches} note={`${m.contextSwitches} outside your mode`} />
        <Figure label="Held back for you" value={m.interruptionsAvoided} note={`${m.interruptions} reached you`} />
        <Figure label="Longest focus" value={formatWait(m.longestFocusStretchMinutes)} note="without a switch or interruption" />
        <Figure label="Agents waited" value={formatWait(view.loops.openLoopMinutes)} note="in total, on you" />
      </dl>
      <Disclosure title="More numbers" className="mt-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
          <Figure label="Refocus time, estimated" value={`${view.lostMinutes}m`} note="An estimate, not a score" />
          <Figure label="Interruptions that were the work" value={m.attendedInMode} note="Agent events inside their mode" />
          <Figure label="Offers" value={view.offers.shown} note={`${view.offers.accepted} taken, ${view.offers.dismissed} set aside`} />
          <Figure label="Offers that stepped aside" value={view.offers.skipped} note="Expired or replaced" />
        </dl>
        <p className="mt-4 max-w-[62ch] text-xs leading-5 text-ink-3">
          At {WARNING_THRESHOLD} switches outside your mode in an hour, FocusDeck suggests a review: at most once an hour and {GOVERNOR.maxWarningsPerDay} times a day.
        </p>
      </Disclosure>
    </section>
  );
}
