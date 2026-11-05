"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { UserModel } from "@/lib/focus/model";
import { providerInfo } from "@/lib/systemTwo/providerCatalog";
import { fetchSystemTwoStatus, type SystemTwoStatus } from "@/lib/client/systemTwoClient";
import { Button, Group, Section, Toggle, selectClass } from "@/components/ui/primitives";
import type { Update } from "./controls";
import type { Suggestions } from "./ProposalsSection";

const CADENCES = [15, 20, 30, 45, 60, 90, 120, 180, 240];

/** Review moments, the quiet first hour, and which helpers may run. */
export function RhythmSection({ model, update, suggestions }: { model: UserModel; update: Update; suggestions: Suggestions }) {
  const [status, setStatus] = useState<SystemTwoStatus | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchSystemTwoStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  const provider = providerInfo(model.systemTwoProvider);
  const chosen = status?.providers.find((p) => p.id === model.systemTwoProvider);
  const cadence = CADENCES.includes(model.reviewEveryMinutes) ? CADENCES : [...CADENCES, model.reviewEveryMinutes].sort((a, b) => a - b);

  return (
    <Section title="Rhythm" description="When FocusDeck brings things back to you, and which helpers it may use. Your own rules always decide first.">
      <Group label="Rhythm and helpers">
        <li className="px-4 py-4 sm:px-5">
          <label className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-ink">
            A review moment every
            <select
              aria-label="How often your review moment comes"
              value={model.reviewEveryMinutes}
              onChange={(e) => update((m) => ({ ...m, reviewEveryMinutes: Number(e.target.value) }))}
              className={selectClass}
            >
              {cadence.map((c) => (
                <option key={c} value={c}>{c < 60 || c % 60 !== 0 ? `${c} minutes` : c === 60 ? "hour" : `${c / 60} hours`}</option>
              ))}
            </select>
          </label>
          <p className="mt-1.5 max-w-[62ch] text-sm leading-6 text-ink-2">
            Held agents and notifications wait for this instead of pinging you. Shorter keeps agents busier; longer protects more of your focus.
            The Lab shows the trade-off.
          </p>
        </li>
        <li className="px-4 py-4 sm:px-5">
          <Toggle
            checked={model.quietFirstBuildHour}
            onChange={(quietFirstBuildHour) => update((m) => ({ ...m, quietFirstBuildHour }))}
            label="Stay quiet for my first hour of Building"
            description="Nothing interrupts the first 60 minutes of Building. Blocked agents wait in Waiting on you."
          />
        </li>
        <li className="px-4 py-4 sm:px-5">
          <Toggle
            checked={model.systemOneEnabled}
            onChange={(systemOneEnabled) => update((m) => ({ ...m, systemOneEnabled }))}
            label="Let FocusDeck judge unclear events on this machine"
            description="For the few events your rules leave open, an on-device judge (System One) decides from metadata. Off, those events are held for your review."
          />
        </li>
        <li className="px-4 py-4 sm:px-5">
          <Toggle
            checked={model.systemTwoEnabled}
            onChange={(systemTwoEnabled) => update((m) => ({ ...m, systemTwoEnabled }))}
            label="AI helper for suggestions and your weekly paragraph"
            description="The AI helper (System Two) runs only when you ask. It receives weekly totals and the words you wrote on this page, never events or anything a sensor saw."
          />
          <div className="mt-3 space-y-3 sm:pl-[52px]">
            <p className="text-sm leading-6 text-ink-2">
              Runs on <span className="text-ink">{provider.label}</span>
              {!status ? ", checking it now." : chosen?.ready ? ", which is set up." : ", which isn’t set up yet, so FocusDeck uses its plain template."}{" "}
              <Link href="/connect#ai" className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent">
                Choose your AI
              </Link>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" disabled={!suggestions.canAsk || suggestions.busy} onClick={() => void suggestions.ask()}>
                {suggestions.busy ? "Asking the AI helper…" : "Ask the AI helper for suggestions"}
              </Button>
              {!suggestions.canAsk && <span className="text-sm text-ink-3">Turn the AI helper on first.</span>}
            </div>
            {suggestions.note && (
              <p className="max-w-[62ch] text-sm leading-6 text-ink-2" aria-live="polite">
                {suggestions.note}
              </p>
            )}
          </div>
        </li>
      </Group>
    </Section>
  );
}
