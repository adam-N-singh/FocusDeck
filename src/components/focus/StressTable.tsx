"use client";

import { useState } from "react";
import type { StressRow } from "@/lib/focus/stress";
import { heatStep } from "@/components/charts/charts";

const cadenceLabel = (minutes: number) => (minutes >= 9999 ? "React to every ping" : `Review every ${minutes}m`);

const METRICS = {
  estimatedLostMinutes: { label: "Refocus minutes lost", read: (r: StressRow) => r.estimatedLostMinutes, show: (v: number) => `${v}m`, hint: "lower is better" },
  focusMinutes: { label: "Your focus minutes", read: (r: StressRow) => r.focusMinutes, show: (v: number) => `${v}m`, hint: "higher is better" },
  contextSwitches: { label: "Context switches", read: (r: StressRow) => r.contextSwitches, show: (v: number) => String(v), hint: "lower is better" },
  meanWaitMinutes: { label: "Blocked-agent wait", read: (r: StressRow) => r.meanWaitMinutes, show: (v: number) => `${v}m`, hint: "lower is better" },
  agentUtilization: { label: "Agents busy", read: (r: StressRow) => r.agentUtilization, show: (v: number) => `${Math.round(v * 100)}%`, hint: "higher is better" },
} as const;
type MetricKey = keyof typeof METRICS;

/**
 * Stress-test results: parallelism (rows) x review cadence (columns), one
 * seeded 8-hour day per cell. Now run by the policy-aware simulator, so open
 * loops exist and agents idle while they wait — which is why one number per
 * cell isn't enough: pick the metric, and read the trade-off across them.
 */
export function StressTable({ rows }: { rows: StressRow[] }) {
  const [metric, setMetric] = useState<MetricKey>("estimatedLostMinutes");
  const m = METRICS[metric];
  const cadences = [...new Set(rows.map((r) => r.reviewEveryMinutes))].sort((a, b) => b - a);
  const agentCounts = [...new Set(rows.map((r) => r.parallelAgents))].sort((a, b) => a - b);
  const cell = (agents: number, cadence: number) => rows.find((r) => r.parallelAgents === agents && r.reviewEveryMinutes === cadence);
  const values = rows.map(m.read);
  const [lo, hi] = [Math.min(...values), Math.max(...values)];

  return (
    <section aria-label="Stress test" className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <h2 className="text-sm font-semibold tracking-wide text-zinc-200 uppercase">Stress test — parallel agents × review cadence, per 8-hour day</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Read across a row: does a deliberate review moment recover the cost of more agents — and what does it cost the agents?
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Metric">
        {(Object.keys(METRICS) as MetricKey[]).map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={metric === key}
            onClick={() => setMetric(key)}
            className={`rounded-full px-3 py-1.5 text-xs ${metric === key ? "bg-zinc-100 font-medium text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
          >
            {METRICS[key].label}
          </button>
        ))}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-0.5 text-left text-sm">
          <thead>
            <tr className="text-xs text-zinc-500">
              <th className="py-2 pr-3 font-medium">Parallel agents</th>
              {cadences.map((c) => <th key={c} className="px-3 py-2 font-medium">{cadenceLabel(c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {agentCounts.map((agents) => (
              <tr key={agents}>
                <th scope="row" className="py-2 pr-3 font-medium text-zinc-200">{agents}</th>
                {cadences.map((cadence) => {
                  const row = cell(agents, cadence);
                  if (!row) return <td key={cadence} className="px-3 py-2 text-zinc-500">—</td>;
                  const { fill, ink } = heatStep(m.read(row), lo, hi);
                  return (
                    <td
                      key={cadence}
                      className="rounded-md px-3 py-2 tabular-nums"
                      style={{ background: fill, color: ink }}
                      title={`${agents} agents, ${cadenceLabel(cadence).toLowerCase()}: ${row.estimatedLostMinutes}m lost, ${row.focusMinutes}m focus, ${row.contextSwitches} context switches, blocked agents waited ${row.meanWaitMinutes}m on average, agents were busy ${Math.round(row.agentUtilization * 100)}% of the time, ${row.openLoops} loops opened`}
                    >
                      <span className="font-semibold">{m.show(m.read(row))}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Shade = magnitude of the chosen metric (darker is less; {m.hint}). Hover a cell for all five numbers. “React to every
        ping” is the X-post status quo; the other columns run FocusDeck’s default rules with a scheduled review moment.
      </p>
    </section>
  );
}
