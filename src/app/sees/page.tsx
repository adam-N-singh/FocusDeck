import type { Metadata } from "next";
import { SeesView } from "@/components/sees/SeesView";

export const metadata: Metadata = { title: "What it sees — FocusDeck" };

/**
 * What FocusDeck Sees — drafted before any sensor ships (ASSESSMENT.md §6,
 * Stage 0 spike (c)): the privacy surface that makes the rest trustworthy.
 */
export default function SeesPage() {
  return (
    <div className="space-y-4">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold tracking-widest text-emerald-400">THE PRIVACY CONSTITUTION, MADE INSPECTABLE</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">What FocusDeck sees</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          A desktop makes reading content easy, so here the line is architectural rather than a promise: designated apps only,
          metadata only, filtered at the sensor, stored in this browser. This page shows all of it.
        </p>
      </header>
      <SeesView />
    </div>
  );
}
