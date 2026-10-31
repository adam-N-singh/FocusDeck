"use client";

import { useState } from "react";
import { DEMO_QUEUE, IMPLEMENTATION_INTENTION, selectOffer } from "@/lib/focus/offer";

/**
 * The offer surface, Hymah-style (v1 Spec §3.3): your own implementation
 * intention verbatim ("You said:"), exactly one offer, micro-commitment
 * framing, and friction asymmetry — Accept pre-loads the thing and never
 * costs more taps than Dismiss. Dismiss is sacred: one tap, instant, silent,
 * no guilt copy (North-Star §4; Spec §3.2). This panel never blocks anything.
 */
export function OfferPanel() {
  const offer = selectOffer(DEMO_QUEUE);
  const [state, setState] = useState<"showing" | "accepted" | "dismissed">("showing");

  return (
    <section aria-label="Current offer" className="rounded-2xl border border-emerald-900/60 bg-zinc-900/60 p-5">
      <h2 className="text-sm font-semibold tracking-wide text-zinc-200">THE OFFER (HYMAH-STYLE)</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">
        You said: <span className="text-zinc-200">“{IMPLEMENTATION_INTENTION}”</span>
      </p>

      {state === "showing" && offer && (
        <div className="mt-4">
          <p className="text-lg font-medium text-zinc-50">{offer.title}</p>
          <p className="mt-1 text-sm text-zinc-400">
            Next step: {offer.microAction} · ~{offer.estimatedMinutes} min
          </p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setState("accepted")} className="rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-zinc-950">
              {offer.microAction}
            </button>
            <button onClick={() => setState("dismissed")} className="rounded-full bg-zinc-800 px-5 py-2 text-sm text-zinc-200 hover:bg-zinc-700">
              Not now
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-500">Dismissing costs one tap, is never penalized, and is logged silently as signal — not failure.</p>
        </div>
      )}

      {state === "accepted" && (
        <p className="mt-4 text-sm text-zinc-300">Done — the thing is pre-loaded, not just pointed at. Friction asymmetry: accepting was the easiest action on this screen.</p>
      )}
      {state === "dismissed" && (
        <p className="mt-4 text-sm text-zinc-300">Stepped aside instantly. No wall, no guilt, no re-ask during the cool-off. The offer waits in your queue for your review moment.</p>
      )}
      {(state !== "showing") && (
        <button onClick={() => setState("showing")} className="mt-3 text-xs text-zinc-500 underline underline-offset-2">Show the offer again</button>
      )}
    </section>
  );
}
