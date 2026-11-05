"use client";

import { useDeck } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { clockLabel } from "@/lib/client/time";
import { PauseIcon, PlayIcon } from "@/components/ui/icons";
import { Button, Meter, Toggle, selectClass } from "@/components/ui/primitives";

const SPEEDS = [1, 2, 4, 8, 16];

/** A running sample day, hatched so it can never be mistaken for your real one. */
export function DemoBanner() {
  const { state } = useDeck();
  const demo = state.demo;
  if (!demo) return null;
  const progress = (demo.simMinute - demo.startMinute) / (demo.endMinute - demo.startMinute);
  const waiting = !demo.playing && !demo.finished && (demo.deck.offer !== null || demo.deck.pendingQuestion !== null);
  const blind = state.model.designatedApps.length === 0;
  const title = demo.scenario === "x-post" ? "Sample day" : `Simulated day, ${demo.parallelAgents} agent${demo.parallelAgents === 1 ? "" : "s"}`;
  const message = demo.finished
    ? "That’s the end of the sample day. Your real day kept running underneath the whole time."
    : waiting
      ? "Paused so you can answer. Take the offer or set it aside, then press Play."
      : demo.scenario === "x-post"
        ? "Building, then an agent finishes in Slack, Claude Code needs an answer, you open X while the next run finishes, and a Cursor agent blocks while you write."
        : "Agents finish and block at random while you work. Switch modes yourself and watch how each one treats the same events.";

  return (
    <section aria-label="Sample day" className="hatch rounded-2xl border border-line-strong/60 bg-surface/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <p className="text-sm font-medium text-ink">
          {title}
          <span className="ml-2 font-normal text-ink-3">not saved to your week</span>
        </p>
        <span className="text-2xl font-semibold text-ink tabular-nums">{clockLabel(demo.simMinute)}</span>
        <div className="min-w-32 flex-1">
          <Meter value={Math.round(progress * 100)} max={100} label="How far through the sample day" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={demo.playing ? "secondary" : "primary"} disabled={demo.finished} onClick={() => store.updateDemo((d) => ({ ...d, playing: !d.playing }))}>
            {demo.playing ? <PauseIcon /> : <PlayIcon />}
            {demo.playing ? "Pause" : "Play"}
          </Button>
          <select
            aria-label="Speed"
            value={demo.speed}
            onChange={(e) => store.updateDemo((d) => ({ ...d, speed: Number(e.target.value) }))}
            className={`${selectClass} h-8 py-0`}
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>{s} min a second</option>
            ))}
          </select>
          <Button size="sm" variant="ghost" onClick={() => store.stopDemo()}>Stop</Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <p className="max-w-[70ch] text-sm leading-6 text-ink-2" aria-live="polite">{message}</p>
        <Toggle checked={demo.pauseOnOffers} onChange={(pauseOnOffers) => store.updateDemo((d) => ({ ...d, pauseOnOffers }))} label="Pause when FocusDeck speaks" />
      </div>
      {blind && (
        <p className="mt-3 text-sm font-medium text-attention">
          Your setup notices no apps, so FocusDeck can’t see any of this. That’s the privacy model working; choose apps in Setup.
        </p>
      )}
    </section>
  );
}
