"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { offerStats } from "@/lib/focus/deck/summary";
import { answerAll, type QuestionAnswer } from "@/lib/focus/policyAnalysis";
import { DEFAULT_BEHAVIOUR } from "@/lib/focus/policySim";
import { useAppState } from "@/lib/client/hooks";
import { Panel } from "@/components/ui/primitives";

const VERDICT: Record<QuestionAnswer["verdict"], { icon: string; label: string; className: string }> = {
  yes: { icon: "✓", label: "Yes", className: "bg-accent-soft text-accent" },
  marginal: { icon: "≈", label: "Barely", className: "bg-ink/[0.06] text-ink" },
  "trade-off": { icon: "⇄", label: "A trade-off", className: "text-ink ring-1 ring-inset ring-line-strong" },
  no: { icon: "✕", label: "No", className: "bg-attention-soft text-attention" },
};

function Slider({ label, value, min, max, step = 1, format, onChange }: { label: string; value: number; min: number; max: number; step?: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="block text-xs text-ink-2">
      {label}: <span className="font-semibold text-ink tabular-nums">{format(value)}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 block w-full" />
    </label>
  );
}

/**
 * The three questions PRODUCT.md says the stress test must answer, answered
 * live from the policy simulator under assumptions you can move. If (1) and
 * (2) fail here and later in telemetry, the combination should be simplified
 * back — that falsifiability is the point.
 */
export function ThreeQuestions() {
  const state = useAppState();
  const [agents, setAgents] = useState(4);
  const [accept, setAccept] = useState(0.3);
  const [cadence, setCadence] = useState(60);
  const [runMinutes, setRunMinutes] = useState(DEFAULT_BEHAVIOUR.agentRunMeanMinutes);
  // Defer a primitive: a fresh object every render would never settle.
  const deferred = useDeferredValue(`${agents}|${accept}|${cadence}|${runMinutes}`);

  const live = offerStats(state.live.signals);
  const measured = state.hydrated && live.defectionsOffered >= 5 ? live.defectionsAccepted / live.defectionsOffered : null;

  const answers = useMemo(() => {
    const [a, rate, every, run] = deferred.split("|").map(Number);
    return answerAll({
      parallelAgents: a,
      acceptRate: rate,
      reviewEveryMinutes: every,
      behaviour: { agentRunMeanMinutes: run },
      measuredAcceptRate: measured,
    });
  }, [deferred, measured]);

  return (
    <Panel kicker="Falsifiable, on purpose" title="The three questions the stress test must answer">
      <div className="grid gap-4 rounded-xl bg-sunk p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Slider label="Parallel agents" value={agents} min={1} max={8} format={(v) => String(v)} onChange={setAgents} />
        <Slider label="Offers accepted at a defection moment" value={accept} min={0} max={0.6} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={setAccept} />
        <Slider label="Review moment every" value={cadence} min={15} max={180} step={15} format={(v) => `${v} min`} onChange={setCadence} />
        <Slider label="A typical agent run" value={runMinutes} min={10} max={90} step={5} format={(v) => `${v} min`} onChange={setRunMinutes} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {answers.map((a) => {
          const v = VERDICT[a.verdict];
          return (
            <article key={a.id} className="flex flex-col rounded-xl bg-sunk p-4">
              <p className="text-sm text-ink-3">Question {a.id}</p>
              <h3 className="mt-1 text-sm leading-6 text-ink">{a.question}</h3>
              <p className={`mt-3 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${v.className}`}>
                <span aria-hidden>{v.icon}</span>{v.label}
              </p>
              <p className="mt-2 text-sm leading-6 text-ink">{a.headline}</p>
              <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-5 text-ink-2">
                {a.findings.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <p className="mt-auto pt-3 text-xs leading-5 text-ink-3">{a.falsifier}</p>
            </article>
          );
        })}
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-3">
        Five seeded days per number; every policy faces the identical day, so differences are the policy, not luck. These are
        consequences of the assumptions listed below — the questions are settled by telemetry, not by this page.
      </p>
    </Panel>
  );
}
