"use client";

import { useEffect, useState } from "react";
import type { UserModel } from "@/lib/focus/model";
import { fetchSystemTwoStatus, type SystemTwoStatus } from "@/lib/client/systemTwoClient";
import { Panel, Toggle } from "@/components/ui/primitives";

const CADENCES = [15, 20, 30, 45, 60, 90, 120, 180, 240];

/** Review moments, the quiet first hour, and which decision layers may run. */
export function RhythmSection({ model, update }: { model: UserModel; update: (fn: (m: UserModel) => UserModel) => void }) {
  const [status, setStatus] = useState<SystemTwoStatus | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchSystemTwoStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Panel id="rhythm" title="Rhythm and decision layers" kicker="Explicit before inferred">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl bg-zinc-950/60 p-4">
          <label className="block text-sm text-zinc-200">
            Review moment every{" "}
            <select
              aria-label="Review cadence"
              value={model.reviewEveryMinutes}
              onChange={(e) => update((m) => ({ ...m, reviewEveryMinutes: Number(e.target.value) }))}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
            >
              {CADENCES.map((c) => <option key={c} value={c}>{c} minutes</option>)}
            </select>
          </label>
          <p className="text-xs leading-5 text-zinc-500">
            Batched agents and held items wait for this moment instead of pinging you. The Lab shows the trade-off: shorter cadences
            keep agents busier; longer ones protect more of your focus.
          </p>
          <Toggle
            checked={model.quietFirstBuildHour}
            onChange={(quietFirstBuildHour) => update((m) => ({ ...m, quietFirstBuildHour }))}
            label="Stay quiet during my first build hour"
            description="Nothing interrupts the first 60 minutes of Building — blocked agents wait as open loops."
          />
        </div>
        <div className="space-y-4 rounded-xl bg-zinc-950/60 p-4">
          <p className="text-xs leading-5 text-zinc-500">Rules always decide first, for free. These layers are optional, and each can be switched off.</p>
          <Toggle
            checked={model.systemOneEnabled}
            onChange={(systemOneEnabled) => update((m) => ({ ...m, systemOneEnabled }))}
            label="System One for ambiguous events (Layer 2)"
            description="Scores only what the rules can't settle, from metadata, on this machine (a deterministic stand-in for Jev). Off: those events take the safe default — batched."
          />
          <Toggle
            checked={model.systemTwoEnabled}
            onChange={(systemTwoEnabled) => update((m) => ({ ...m, systemTwoEnabled }))}
            label="System Two for drafts and the weekly paragraph (Layer 3)"
            description="Off the hot path, on demand only. Sends weekly aggregates and your declared words (modes, intentions) to Claude — never events, labels, or anything a sensor saw."
          />
          <p className="text-xs text-zinc-500">
            {status
              ? `System Two model: ${status.model}. ${status.credentialsHint ? "Credentials found on the server." : "No API key in the server environment — FocusDeck uses its plain template unless an ant auth profile is available."}`
              : "Checking whether System Two is configured…"}
          </p>
        </div>
      </div>
    </Panel>
  );
}
