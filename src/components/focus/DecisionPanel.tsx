"use client";

import { useState } from "react";
import { decide } from "@/lib/focus/decision";
import type { FocusEvent, ModeId } from "@/lib/focus/types";

const SCENARIOS: { label: string; event: FocusEvent; mode: ModeId }[] = [
  {
    label: "Agent finishes while you build",
    mode: "building",
    event: { id: "s1", atMinute: 34, kind: "agent-finished", app: "terminal", label: "Agent finished", modeAtEvent: "building" },
  },
  {
    label: "Slack ping during Comms mode",
    mode: "comms",
    event: { id: "s2", atMinute: 50, kind: "notification", app: "slack", label: "Slack notification", modeAtEvent: "comms" },
  },
  {
    label: "Agent blocks while you write",
    mode: "writing",
    event: { id: "s3", atMinute: 90, kind: "agent-needs-input", app: "claude-code", label: "Agent needs input", modeAtEvent: "writing" },
  },
];

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 text-zinc-500">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full bg-emerald-400" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="w-10 text-right font-mono text-zinc-300">{value.toFixed(2)}</span>
    </div>
  );
}

/**
 * Where decision models play: rules first (free, explainable), Jev-style
 * System One only for ambiguous events, LLMs never per-event, and the user
 * confirming anything learned. The thread asked "deterministic, or constantly
 * running a model?" — this panel is the answer: bit of both, in that order.
 */
export function DecisionPanel() {
  const [index, setIndex] = useState(0);
  const scenario = SCENARIOS[index];
  const decision = decide(scenario.event, scenario.mode);

  return (
    <section aria-label="Decision models" className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <h2 className="text-sm font-semibold tracking-wide text-zinc-200">DECISION MODELS — RULES, THEN JEV, THEN (RARELY) AN LLM</h2>
      <p className="mt-1 text-sm leading-6 text-zinc-500">
        Jev (TypeSafe&apos;s System One model) doesn&apos;t generate text — it returns typed probabilities with
        calibrated confidence, fast enough for real-time routing. Here it only sees what the rules cannot settle.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SCENARIOS.map((s, i) => (
          <button key={s.label} onClick={() => setIndex(i)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${i === index ? "bg-zinc-100 text-zinc-950" : "bg-zinc-800 text-zinc-300"}`}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-2 rounded-xl bg-zinc-950/60 p-4">
        <p className="text-sm text-zinc-200">
          Decision: <span className="font-semibold text-emerald-300">{decision.action}</span>
          <span className="text-zinc-500"> via {decision.source} · confidence {decision.confidence.toFixed(2)}</span>
        </p>
        <p className="text-sm text-zinc-400">{decision.explanation}</p>
        {decision.systemOne ? (
          <div className="space-y-1.5 pt-2">
            <Bar label="Needs you now?" value={decision.systemOne.needsUserNow} />
            <Bar label="Urgency" value={decision.systemOne.urgency} />
            <Bar label="Is defection?" value={decision.systemOne.isDefection} />
          </div>
        ) : (
          <p className="pt-1 text-xs text-zinc-500">No System One answers — the deterministic rule was definitive, so no model spend, no latency, nothing to audit beyond the rule itself.</p>
        )}
      </div>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm leading-6 text-zinc-400">
        <li><span className="text-zinc-200">Rules</span> decide allow-list and blocked-agent cases. Instant, free, explainable.</li>
        <li><span className="text-zinc-200">Jev / System One</span> scores only the ambiguous residue. Thresholds are our policy, not the model&apos;s. Low confidence → batch, never suppress.</li>
        <li><span className="text-zinc-200">LLM / System Two</span> works off the hot path: chunking, offer phrasing, weekly synthesis, proposing new modes for you to approve.</li>
        <li><span className="text-zinc-200">You</span> confirm anything learned before it can act (Hymah&apos;s inspectable-model rule).</li>
      </ol>
    </section>
  );
}
