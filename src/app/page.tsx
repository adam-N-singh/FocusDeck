"use client";

import { useMemo, useState } from "react";
import { DecisionPanel } from "@/components/focus/DecisionPanel";
import { EventTimeline } from "@/components/focus/EventTimeline";
import { MetricsPanel } from "@/components/focus/MetricsPanel";
import { ModeDock } from "@/components/focus/ModeDock";
import { OfferPanel } from "@/components/focus/OfferPanel";
import { StressTable } from "@/components/focus/StressTable";
import { SynthesisPanel } from "@/components/focus/SynthesisPanel";
import { computeMetrics } from "@/lib/focus/metrics";
import { simulateDay } from "@/lib/focus/simulator";
import { POST_DAY_EVENTS } from "@/lib/focus/scenarios";
import { runStressSweep } from "@/lib/focus/stress";
import type { ModeId } from "@/lib/focus/types";

type DaySource = "post" | "simulated";

export default function Home() {
  const [activeMode, setActiveMode] = useState<ModeId>("building");
  const [paused, setPaused] = useState(false);
  const [daySource, setDaySource] = useState<DaySource>("post");
  const [parallelAgents, setParallelAgents] = useState(4);
  const [seed, setSeed] = useState(42);

  const events = useMemo(
    () =>
      daySource === "post"
        ? POST_DAY_EVENTS
        : simulateDay({ seed, parallelAgents, durationMinutes: 480, reviewEveryMinutes: 60 }),
    [daySource, seed, parallelAgents],
  );
  const metrics = useMemo(() => computeMetrics(events), [events]);
  const stressRows = useMemo(() => runStressSweep(), []);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold tracking-widest text-emerald-400">HYMAH × MODES × AGENTS — A COMBINATION, NOT A COPY</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-50">FocusDeck</h1>
        <p className="mt-3 text-base leading-7 text-zinc-400">
          Hymah&apos;s attention engine, running in the agent-heavy desktop world the X posts
          describe. Not the X post&apos;s dock replica, and not Hymah&apos;s mobile app: you declare
          intentions and modes in calm moments; FocusDeck notices both the defection moment
          (opening X while an agent runs) and the interruption moment (an agent blocking while
          you build), and answers both with the same offer — your own words, one tap away — or
          batches it as an open loop for your review moment. Replacement, never restriction.
        </p>
      </header>

      <div className="mt-6"><SynthesisPanel /></div>

      <div className="mt-6">
        <ModeDock activeMode={activeMode} onChange={setActiveMode} paused={paused} onTogglePaused={() => setPaused((v) => !v)} />
      </div>

      <div className="mt-4"><OfferPanel /></div>
      <div className="mt-4"><DecisionPanel /></div>

      <section aria-label="Day controls" className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex gap-2" role="group" aria-label="Day source">
          <button onClick={() => setDaySource("post")} className={`rounded-full px-4 py-2 text-sm font-medium ${daySource === "post" ? "bg-zinc-100 text-zinc-950" : "bg-zinc-800 text-zinc-300"}`}>
            The X-post day
          </button>
          <button onClick={() => setDaySource("simulated")} className={`rounded-full px-4 py-2 text-sm font-medium ${daySource === "simulated" ? "bg-zinc-100 text-zinc-950" : "bg-zinc-800 text-zinc-300"}`}>
            Simulated day
          </button>
        </div>
        {daySource === "simulated" && (
          <>
            <label className="text-sm text-zinc-400">
              Parallel agents: <span className="font-semibold text-zinc-100">{parallelAgents}</span>
              <input type="range" min={1} max={8} value={parallelAgents} onChange={(e) => setParallelAgents(Number(e.target.value))} className="ml-2 align-middle" />
            </label>
            <button onClick={() => setSeed((s) => s + 1)} className="rounded-full bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700">
              New day (seed {seed})
            </button>
          </>
        )}
        <p className="text-xs text-zinc-500">Currently previewing mode: {activeMode}. The log shows each event&apos;s mode at the time it happened.</p>
      </section>

      <div className="mt-4"><MetricsPanel metrics={metrics} /></div>
      <div className="mt-4"><EventTimeline events={events.slice(0, daySource === "post" ? undefined : 40)} /></div>
      {daySource === "simulated" && events.length > 40 && (
        <p className="mt-2 text-xs text-zinc-500">Showing first 40 of {events.length} events. Metrics above cover the full day.</p>
      )}
      <div className="mt-4"><StressTable rows={stressRows} /></div>

      <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-200">HOW TO STRESS-TEST THIS FOR REAL</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-zinc-400">
          <li>Instrument first, intervene second: ship the switch counter alone for a week. 506 is a baseline, not a verdict.</li>
          <li>Vary one lever at a time: agent parallelism, then review cadence, then classifier strictness. The table above is that sweep, simulated.</li>
          <li>Judge open loops, not raw switches: a switch inside Reviewing-agents mode is work; the same switch inside Writing is a leak.</li>
          <li>Keep the classifier deterministic-first, pause-able, and logged — the trust controls the thread explicitly asked for.</li>
        </ol>
      </section>
    </main>
  );
}
