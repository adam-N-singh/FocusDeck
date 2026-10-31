"use client";

import { useRouter } from "next/navigation";
import { useDeck } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { clockLabel } from "@/lib/client/time";
import { Button, Panel, Toggle } from "@/components/ui/primitives";

const SPEEDS = [1, 2, 4, 8, 16];

/** A running demo, clearly marked: its own clock, its own deck, never your real day. */
export function DemoBanner() {
  const { state } = useDeck();
  const demo = state.demo;
  if (!demo) return null;
  const progress = (demo.simMinute - demo.startMinute) / (demo.endMinute - demo.startMinute);
  const waiting = !demo.playing && !demo.finished && (demo.deck.offer !== null || demo.deck.pendingQuestion !== null);
  const nothingVisible = state.model.designatedApps.length === 0;
  return (
    <Panel
      tone="warn"
      kicker="Demo — simulated, not saved to your mirror"
      title={demo.scenario === "x-post" ? "The X-post day" : `A simulated day with ${demo.parallelAgents} agent${demo.parallelAgents === 1 ? "" : "s"}`}
      actions={
        <>
          <Button size="sm" variant={demo.playing ? "secondary" : "primary"} disabled={demo.finished} onClick={() => store.updateDemo((d) => ({ ...d, playing: !d.playing }))}>
            {demo.playing ? "Pause" : "Play"}
          </Button>
          <label className="text-xs text-zinc-400">
            Speed{" "}
            <select
              value={demo.speed}
              onChange={(e) => store.updateDemo((d) => ({ ...d, speed: Number(e.target.value) }))}
              className="rounded-md border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-zinc-100"
            >
              {SPEEDS.map((s) => <option key={s} value={s}>{s} min/s</option>)}
            </select>
          </label>
          <Button size="sm" variant="ghost" onClick={() => store.stopDemo()}>Stop demo</Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-4">
        <span className="font-mono text-2xl text-zinc-50 tabular-nums">{clockLabel(demo.simMinute)}</span>
        <div className="h-1.5 min-w-40 flex-1 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full bg-amber-400" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <Toggle checked={demo.pauseOnOffers} onChange={(pauseOnOffers) => store.updateDemo((d) => ({ ...d, pauseOnOffers }))} label="Pause when FocusDeck speaks" />
      </div>
      <p className="mt-2 text-sm text-zinc-400" aria-live="polite">
        {demo.finished
          ? "The demo day is over. Your real day kept running underneath the whole time."
          : waiting
            ? "Paused so you can answer — take the offer or set it aside, then press Play."
            : demo.scenario === "x-post"
              ? "Building → an agent finishes in Slack → Claude Code needs an answer → X while the next run finishes → Writing, where a Cursor agent blocks."
              : "Agents finish and block at random while you build. Switch modes yourself and watch how each one treats the same events."}
      </p>
      {nothingVisible && (
        <p className="mt-2 text-sm text-amber-200">
          Your model designates no apps, so FocusDeck can’t see any of this. That’s the privacy model working — designate apps in Declare.
        </p>
      )}
    </Panel>
  );
}

/** First run: declare in a calm moment — or look around with the demo model first. Designation is an explicit choice either way. */
export function OnboardingCard() {
  const { state } = useDeck();
  const router = useRouter();
  if (!state.hydrated || state.onboarded) return null;
  return (
    <Panel tone="accent" kicker="Start here" title="Declare in a calm moment">
      <p className="max-w-3xl text-sm leading-6 text-zinc-300">
        FocusDeck only knows what you tell it: the modes you work in, which apps it may notice (per app, opt-in), your two or three
        trap apps, and what you’d rather do at the moment you reach for one — in your own words. Nothing is ever blocked.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => { store.chooseModel("blank"); router.push("/declare"); }}>Declare my own (2 minutes)</Button>
        <Button onClick={() => store.chooseModel("demo")}>Look around with the demo model</Button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">The demo model designates every catalog app so the demo works — you can opt out of each one in Declare.</p>
    </Panel>
  );
}
