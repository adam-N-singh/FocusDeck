import type { Metadata } from "next";
import { DecisionPanel } from "@/components/focus/DecisionPanel";
import { StressTable } from "@/components/focus/StressTable";
import { SynthesisPanel } from "@/components/focus/SynthesisPanel";
import { AssumptionsPanel, CalibrationPanel, DayExplorer } from "@/components/lab/LabPanels";
import { ThreeQuestions } from "@/components/lab/ThreeQuestions";
import { runStressSweep } from "@/lib/focus/stress";

export const metadata: Metadata = { title: "Lab — FocusDeck" };

/**
 * The Lab — prove the moment cheaply, or find out cheaply that it doesn't
 * work (PRODUCT.md). The stress sweep is seeded and deterministic, so it is
 * computed once on the server and shipped as data.
 */
export default function LabPage() {
  const rows = runStressSweep();
  return (
    <div className="space-y-4">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold tracking-widest text-emerald-400">BEFORE BUILDING ANY OS-LEVEL SENSOR</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">Lab</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          The stress test, the decision models, and the combination itself. If mode-scoping and review cadences don’t pay off here
          and later in telemetry, the combination has no advantage over its parents and should be simplified back.
        </p>
      </header>
      <ThreeQuestions />
      <StressTable rows={rows} />
      <AssumptionsPanel />
      <DecisionPanel />
      <CalibrationPanel />
      <DayExplorer />
      <SynthesisPanel />
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-200">HOW TO STRESS-TEST THIS FOR REAL</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-zinc-400">
          <li>Instrument first, intervene second: run the sensors with guarding paused for a week. 506 is a baseline, not a verdict.</li>
          <li>Vary one lever at a time: agent parallelism, then review cadence, then classifier strictness. The table above is that sweep, simulated.</li>
          <li>Judge open loops, not raw switches: a switch inside Reviewing-agents mode is work; the same switch inside Writing is a leak.</li>
          <li>Keep the classifier deterministic-first, pause-able, and logged — the trust controls the thread explicitly asked for.</li>
          <li>Replace the assumptions with your telemetry, then re-read the three questions. Label ambiguous events so System One’s calibration is measured, not assumed.</li>
        </ol>
      </section>
    </div>
  );
}
