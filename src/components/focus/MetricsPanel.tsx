import { estimatedLostMinutes } from "@/lib/focus/metrics";
import { WARNING_THRESHOLD } from "@/lib/focus/modes";
import type { DayMetrics } from "@/lib/focus/types";

function Stat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-xs font-medium tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-zinc-50">{value}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{hint}</p>
    </div>
  );
}

/** Headline numbers — the "506 switches" counter, split into what it actually costs. */
export function MetricsPanel({ metrics }: { metrics: DayMetrics }) {
  const topApp = Object.entries(metrics.switchesByApp).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
  return (
    <section aria-label="Day metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <Stat label="APP / TAB SWITCHES" value={metrics.totalSwitches} hint="The headline counter from the post." />
      <Stat label="CONTEXT SWITCHES" value={metrics.contextSwitches} hint="Switches outside your active mode — the expensive kind." />
      <Stat label="EST. REFOCUS COST" value={`${estimatedLostMinutes(metrics)}m`} hint="Mode-aware estimate, not a scare number." />
      <Stat label="INTERRUPTIONS LET THROUGH" value={metrics.interruptions} hint="Classified needs-you-now in the active mode." />
      <Stat label="HELD BACK FOR YOU" value={metrics.interruptionsAvoided} hint="Batched for your review moment — viewable anytime, never a wall." />
      <Stat
        label="OPEN LOOPS"
        value={metrics.openLoops}
        hint={topApp ? `Agents waiting on you. Most-switched: ${topApp[0]} (${topApp[1]}×).` : "Agents waiting on you."}
      />
      <Stat label={`${WARNING_THRESHOLD}-SWITCH WARNINGS`} value={metrics.warningCount} hint="Times you crossed the warning in a rolling hour." />
      <Stat label="LONGEST FOCUS STRETCH" value={`${metrics.longestFocusStretchMinutes}m`} hint="Best uninterrupted block in this day." />
    </section>
  );
}
