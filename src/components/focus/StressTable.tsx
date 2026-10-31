import type { StressRow } from "@/lib/focus/stress";

const cadenceLabel = (minutes: number) => (minutes >= 9999 ? "never" : `every ${minutes}m`);

/** Stress-test results: parallelism (rows) x review cadence (columns), cell = est. lost minutes. */
export function StressTable({ rows }: { rows: StressRow[] }) {
  const cadences = [...new Set(rows.map((r) => r.reviewEveryMinutes))].sort((a, b) => a - b);
  const agentCounts = [...new Set(rows.map((r) => r.parallelAgents))].sort((a, b) => a - b);
  const cell = (agents: number, cadence: number) => rows.find((r) => r.parallelAgents === agents && r.reviewEveryMinutes === cadence);

  return (
    <section aria-label="Stress test" className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h2 className="text-sm font-semibold tracking-wide text-zinc-200">STRESS TEST — EST. REFOCUS MINUTES LOST / 8H DAY</h2>
      <p className="mt-1 text-sm text-zinc-500">Seeded simulation. Read across: does a deliberate Reviewing-agents cadence recover the cost of more parallel agents?</p>
      <table className="mt-3 w-full min-w-[520px] text-left text-sm">
        <thead>
          <tr className="text-zinc-500">
            <th className="py-2 pr-3 font-medium">Parallel agents</th>
            {cadences.map((c) => <th key={c} className="py-2 pr-3 font-medium">Review {cadenceLabel(c)}</th>)}
          </tr>
        </thead>
        <tbody>
          {agentCounts.map((agents) => (
            <tr key={agents} className="border-t border-zinc-800">
              <th className="py-2 pr-3 font-medium text-zinc-200">{agents}</th>
              {cadences.map((cadence) => {
                const row = cell(agents, cadence);
                return (
                  <td key={cadence} className="py-2 pr-3 text-zinc-300">
                    {row ? <>{row.estimatedLostMinutes}m <span className="text-xs text-zinc-500">({row.totalSwitches} switches, {row.openLoops} open)</span></> : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
