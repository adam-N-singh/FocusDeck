import type { Metadata } from "next";
import { DeclareView } from "@/components/declare/DeclareView";

export const metadata: Metadata = { title: "Declare — FocusDeck" };

/**
 * Declare — intentions, tasks, interests, trap apps, modes, review moments,
 * and mode-scoped implementation intentions, in your own words (PRODUCT.md,
 * core loop step 1). Everything FocusDeck offers traces back to this page.
 */
export default function DeclarePage() {
  return (
    <div className="space-y-4">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold tracking-widest text-emerald-400">STEP 1 OF THE CORE LOOP</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">Declare</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          In a calm moment, tell FocusDeck how you work: which apps it may notice, the modes you work in and what may interrupt
          each, what you’d rather do when you reach for a trap app — in your own words — and when your review moments are.
          This is your inspectable model. FocusDeck offers nothing that doesn’t trace back to it.
        </p>
      </header>
      <DeclareView />
    </div>
  );
}
