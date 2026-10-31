"use client";

import { useMemo, useState } from "react";
import { calibrationReport, samplesFromDeck, type CalibrationSample } from "@/lib/focus/calibration";
import { computeMetrics } from "@/lib/focus/metrics";
import { DEFAULT_BEHAVIOUR, DEFAULT_COSTS } from "@/lib/focus/policySim";
import { POST_DAY_EVENTS } from "@/lib/focus/scenarios";
import { createRng, simulateDay } from "@/lib/focus/simulator";
import { useAppState } from "@/lib/client/hooks";
import { EventTimeline } from "@/components/focus/EventTimeline";
import { MetricsPanel } from "@/components/focus/MetricsPanel";
import { Button, Panel } from "@/components/ui/primitives";

const ASSUMPTIONS: [string, string, string][] = [
  ["Agent run", `${DEFAULT_BEHAVIOUR.agentRunMeanMinutes} min on average`, "Exponentially distributed between pings"],
  ["Run ends blocked", `${Math.round(DEFAULT_BEHAVIOUR.agentBlockProbability * 100)}%`, "Otherwise it finished and needs a review"],
  ["Attending an agent", `${DEFAULT_BEHAVIOUR.attendMinutes} min`, "Answering, or reviewing a result"],
  ["Pull toward the feed", `${DEFAULT_BEHAVIOUR.defectBasePerMinute * 100}% a minute + ${DEFAULT_BEHAVIOUR.defectPerRunningAgent * 100}% per running agent`, "“Open X while the next run finishes”"],
  ["A feed visit", `${DEFAULT_BEHAVIOUR.feedMinutes} min`, "Then the refocus"],
  ["Notifications", `${DEFAULT_BEHAVIOUR.notificationPerMinute * 100}% a minute; checked ${Math.round(DEFAULT_BEHAVIOUR.checkNotificationProbability * 100)}% of the time`, "When nothing holds them"],
  ["Refocus after a switch", `${DEFAULT_COSTS.inModeSwitch} in-mode · ${DEFAULT_COSTS.contextSwitch} context · ${DEFAULT_COSTS.interruption} interrupted (min)`, "The prototype's cost model; overlapping refocus doesn't stack"],
  ["Deciding on an offer", `${DEFAULT_COSTS.offerDecision} min`, "Paid whether it's accepted or not"],
];

export function AssumptionsPanel() {
  return (
    <Panel kicker="Every number above follows from these" title="Assumptions">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <tbody>
            {ASSUMPTIONS.map(([name, value, note]) => (
              <tr key={name} className="border-t border-zinc-800 align-top">
                <td className="py-2 pr-3 text-zinc-200">{name}</td>
                <td className="py-2 pr-3 text-zinc-300 tabular-nums">{value}</td>
                <td className="py-2 text-xs text-zinc-500">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-500">Defined in src/lib/focus/policyConfig.ts. Replace them with your own week of telemetry before trusting a verdict.</p>
    </Panel>
  );
}

/** The prototype's original views: the X-post day, beat for beat, and a replayable simulated day, as rules-only metrics. */
export function DayExplorer() {
  const [source, setSource] = useState<"post" | "simulated">("post");
  const [agents, setAgents] = useState(4);
  const [seed, setSeed] = useState(42);
  const events = useMemo(
    () => (source === "post" ? POST_DAY_EVENTS : simulateDay({ seed, parallelAgents: agents, durationMinutes: 480, reviewEveryMinutes: 60 })),
    [source, seed, agents],
  );
  const metrics = useMemo(() => computeMetrics(events), [events]);
  return (
    <div className="space-y-4">
      <section aria-label="Day controls" className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex gap-2" role="group" aria-label="Day source">
          <Button variant={source === "post" ? "primary" : "secondary"} onClick={() => setSource("post")}>The X-post day</Button>
          <Button variant={source === "simulated" ? "primary" : "secondary"} onClick={() => setSource("simulated")}>Simulated day</Button>
        </div>
        {source === "simulated" && (
          <>
            <label className="text-sm text-zinc-400">
              Parallel agents: <span className="font-semibold text-zinc-100">{agents}</span>
              <input type="range" min={1} max={8} value={agents} onChange={(e) => setAgents(Number(e.target.value))} className="ml-2 align-middle accent-emerald-400" />
            </label>
            <Button onClick={() => setSeed((s) => s + 1)}>New day (seed {seed})</Button>
          </>
        )}
        <p className="text-xs text-zinc-500">Rules-only classification of a fixed event trace — the live deck on Now adds your intentions and System One.</p>
      </section>
      <MetricsPanel metrics={metrics} />
      <EventTimeline events={events.slice(0, source === "post" ? undefined : 40)} />
      {source === "simulated" && events.length > 40 && <p className="text-xs text-zinc-500">Showing the first 40 of {events.length} events. The metrics cover the whole day.</p>}
    </div>
  );
}

/** Synthetic labels: a hidden "truth" the mock never sees, to show what the report reveals. */
function syntheticSamples(seed: number): CalibrationSample[] {
  const rng = createRng(seed);
  return Array.from({ length: 120 }, () => {
    const predicted = [0.4, 0.45, 0.88, 0.92][Math.floor(rng() * 4)];
    return { predicted, actual: rng() < (predicted > 0.8 ? 0.62 : 0.35) };
  });
}

/** The Jev spike, runnable: is System One calibrated on your labeled events at the 0.8 threshold? */
export function CalibrationPanel() {
  const state = useAppState();
  const [demo, setDemo] = useState(false);
  const samples = demo ? syntheticSamples(7) : samplesFromDeck(state.live);
  const report = calibrationReport(samples);
  return (
    <Panel kicker="The spike question, runnable" title="Is System One calibrated on your events?">
      <p className="text-sm leading-6 text-zinc-400">
        Label ambiguous events in the activity log (“did this need you?”). This compares what System One said with what you said —
        for today’s stand-in, and for a real Jev adapter later, before it is ever trusted on the hot path.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant={demo ? "secondary" : "primary"} onClick={() => setDemo(false)}>My labels ({samplesFromDeck(state.live).length})</Button>
        <Button size="sm" variant={demo ? "primary" : "secondary"} onClick={() => setDemo(true)}>Synthetic labels (demo)</Button>
      </div>
      <p className="mt-3 text-sm text-zinc-100">{report.verdict}</p>
      {report.n > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead><tr className="text-xs text-zinc-500"><th className="py-1 pr-3 font-medium">System One said</th><th className="py-1 pr-3 font-medium">Events</th><th className="py-1 pr-3 font-medium">Mean probability</th><th className="py-1 font-medium">Actually needed you</th></tr></thead>
            <tbody>
              {report.buckets.filter((b) => b.count > 0).map((b) => (
                <tr key={b.from} className="border-t border-zinc-800 tabular-nums text-zinc-300">
                  <td className="py-1.5 pr-3">{b.from.toFixed(1)}–{b.to.toFixed(1)}</td>
                  <td className="py-1.5 pr-3">{b.count}</td>
                  <td className="py-1.5 pr-3">{Math.round(b.meanPredicted * 100)}%</td>
                  <td className="py-1.5">{Math.round(b.observedRate * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-zinc-500">ECE {report.ece} · Brier {report.brier} · right above the 0.8 threshold: {report.precisionAtThreshold === null ? "—" : `${Math.round(report.precisionAtThreshold * 100)}%`}</p>
        </div>
      )}
    </Panel>
  );
}
