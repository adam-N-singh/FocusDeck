import type { Metadata } from "next";
import { MirrorView } from "@/components/mirror/MirrorView";

export const metadata: Metadata = { title: "Mirror — FocusDeck" };

/** Show — the weekly honest mirror (PRODUCT.md, core loop step 6). */
export default function MirrorPage() {
  return (
    <div className="space-y-4">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold tracking-widest text-emerald-400">STEP 6 OF THE CORE LOOP</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">The honest mirror</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          A weekly look back: evidence that only accumulates, a trend with a state word instead of a score, how long your agents
          waited on you, and the misses counted plainly. Private, adult, and quiet — never a shame machine.
        </p>
      </header>
      <MirrorView />
    </div>
  );
}
