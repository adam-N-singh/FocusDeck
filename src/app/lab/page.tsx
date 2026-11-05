import type { Metadata } from "next";
import { DecisionPanel } from "@/components/focus/DecisionPanel";
import { StressTable } from "@/components/focus/StressTable";
import { SynthesisPanel } from "@/components/focus/SynthesisPanel";
import { AssumptionsPanel, CalibrationPanel, DayExplorer } from "@/components/lab/LabPanels";
import { ThreeQuestions } from "@/components/lab/ThreeQuestions";
import { PageHeader, Panel } from "@/components/ui/primitives";
import { runStressSweep } from "@/lib/focus/stress";

export const metadata: Metadata = { title: "Lab" };

/**
 * The Lab — prove the moment cheaply, or find out cheaply that it doesn't
 * work (PRODUCT.md). The stress sweep is seeded and deterministic, so it is
 * computed once on the server and shipped as data.
 */
export default function LabPage() {
  const rows = runStressSweep();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Lab"
        description="The simulations behind FocusDeck. If modes and review moments don’t pay off here, and later in real use, FocusDeck should be simplified back. You don’t need any of this to use it."
      />
      <ThreeQuestions />
      <StressTable rows={rows} />
      <AssumptionsPanel />
      <DecisionPanel />
      <CalibrationPanel />
      <DayExplorer />
      <SynthesisPanel />
      <Panel title="How to test this for real">
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-ink-2 marker:text-ink-3">
          <li>Measure first, intervene second: run the sensors with FocusDeck paused for a week. 506 switches is a baseline, not a verdict.</li>
          <li>Change one lever at a time: how many agents run, then how often you review, then how strict the classifier is. The table above is that sweep, simulated.</li>
          <li>Judge agents waiting, not raw switches: a switch inside Reviewing agents is work; the same switch inside Writing is a leak.</li>
          <li>Keep the classifier rules-first, pausable and logged, the trust controls people asked for.</li>
          <li>Replace the assumptions with your own week, then read the three questions again. Label unclear events so the on-device judge’s calibration is measured, not assumed.</li>
        </ol>
      </Panel>
    </div>
  );
}
