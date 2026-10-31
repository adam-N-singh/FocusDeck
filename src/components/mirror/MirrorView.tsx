"use client";

import { useMemo, useState } from "react";
import { hasActivity, summarizeDay, upsertDay } from "@/lib/focus/history";
import { deriveHypotheses } from "@/lib/focus/learn";
import { buildMirror } from "@/lib/focus/mirror";
import { buildSynthesisPayload, templateSynthesis } from "@/lib/systemTwo/payload";
import { useDeck } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { requestSynthesis, type SynthesisResult } from "@/lib/client/systemTwoClient";
import { StateBadge, TrendSparkline, WaitBars } from "@/components/charts/charts";
import { Badge, Button, Panel, Skeleton, Stat } from "@/components/ui/primitives";

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

/**
 * Show — the weekly honest mirror: cumulative evidence, trend with a state
 * word (no hero number), open-loop ageing, misses admitted plainly, one
 * supportive statement, and the coming week. Private and recoverable.
 */
export function MirrorView() {
  const { state, modes } = useDeck();
  const { model, live, history } = state;
  const [synthesis, setSynthesis] = useState<SynthesisResult | null>(null);
  const [busy, setBusy] = useState(false);

  const mirror = useMemo(() => {
    // Today counts toward this week as it happens; it's archived for good at midnight.
    const today = summarizeDay(live, modes);
    const days = hasActivity(today) ? upsertDay(history, today) : history;
    return buildMirror(days, live.day, {
      reviewEveryMinutes: model.reviewEveryMinutes,
      openLoopsNow: live.loops.filter((l) => l.closedAtMinute === undefined).length,
      activeIntentions: model.intentions.filter((i) => i.enabled).length,
      trapApps: model.trapApps.length,
      pendingProposals: deriveHypotheses({ model, deck: live, history }).length,
    });
  }, [live, history, model, modes]);

  if (!state.hydrated) return <Panel><Skeleton lines={6} /></Panel>;

  if (mirror.weeks.length === 0) {
    return (
      <Panel title="Nothing to mirror yet" kicker="The mirror fills as you work">
        <p className="max-w-2xl text-sm leading-6 text-zinc-400">
          Once FocusDeck has seen a day — through a sensor, or moments you try on the Now screen — this page shows your week. To see
          what it will look like, load four weeks of clearly labelled demo history.
        </p>
        <Button className="mt-3" variant="primary" onClick={() => store.loadDemoHistory()}>Load demo history</Button>
      </Panel>
    );
  }

  const week = mirror.thisWeek;
  const payload = buildSynthesisPayload(mirror, model.intentions.filter((i) => i.enabled).map((i) => i.text));
  const writeParagraph = async () => {
    setBusy(true);
    setSynthesis(await requestSynthesis(payload));
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      {mirror.hasDemo && (
        <Panel tone="warn" kicker="Includes demo data" title="Some of these days are simulated">
          <p className="text-sm text-zinc-400">Demo days are labelled and never mixed silently with yours. Remove them anytime.</p>
          <Button size="sm" className="mt-2" onClick={() => store.clearDemoHistory()}>Remove demo history</Button>
        </Panel>
      )}

      <Panel kicker={mirror.isCurrentWeek ? "This week" : "Last week"} title="Your trend">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="space-y-3">
            <StateBadge state={mirror.state} size="lg" />
            {mirror.supportive && <p className="text-base leading-7 text-zinc-200">{mirror.supportive}</p>}
            <p className="text-xs leading-5 text-zinc-500">
              The state word compares this week with the last on context switches per focus hour, how long agents waited, and how
              often you chose your own offer. There is no score — just direction.
            </p>
          </div>
          <TrendSparkline weeks={mirror.weeks} />
        </div>
      </Panel>

      <Panel kicker="Only ever rises" title="Cumulative evidence">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {mirror.cumulative.map((c) => <Stat key={c.label} label={c.label} value={`${c.value}${c.unit ?? ""}`} />)}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel kicker="The headline target" title="How long agents waited">
          <WaitBars weeks={mirror.weeks} />
          <p className="mt-3 text-xs text-zinc-500">Mean minutes from an agent blocking to you answering it, per week.</p>
        </Panel>
        <Panel kicker="Counted plainly" title="Misses">
          {week && mirror.misses.length > 0 ? (
            <ul className="space-y-2">
              {mirror.misses.map((m) => (
                <li key={m.label} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-zinc-300">{m.label}</span>
                  <span className="text-zinc-100 tabular-nums">{m.count}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-zinc-400">No misses to count.</p>}
          <p className="mt-3 text-xs text-zinc-500">Setting an offer aside is never a miss — dismissing is always allowed.</p>
        </Panel>
      </div>

      <Panel kicker="Off the hot path" title="This week in a paragraph" actions={
        model.systemTwoEnabled ? <Button size="sm" disabled={busy} onClick={() => void writeParagraph()}>{busy ? "Writing…" : "Ask System Two"}</Button> : undefined
      }>
        <p className="max-w-3xl text-sm leading-7 text-zinc-200">{synthesis?.text ?? templateSynthesis(payload)}</p>
        <p className="mt-2 text-xs text-zinc-500">
          {synthesis?.source === "system-two"
            ? `Written by System Two (${synthesis.model}) from the numbers on this page and your declared intentions — nothing else.`
            : synthesis?.note ?? (model.systemTwoEnabled ? "The plain template. Ask System Two for a written paragraph." : "The plain template. System Two is off (Declare → Rhythm).")}
        </p>
      </Panel>

      <Panel kicker="The table view" title="Week by week">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-xs text-zinc-500">
                {["Week of", "Days", "Context switches / focus hour", "Mean agent wait", "Agents over an hour", "Chose your offer", "State"].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...mirror.weeks].reverse().map((w) => (
                <tr key={w.weekStart} className="border-t border-zinc-800 text-zinc-300">
                  <td className="py-2 pr-3">{w.weekStart}{w.demo && <span className="ml-2"><Badge>demo</Badge></span>}</td>
                  <td className="py-2 pr-3 tabular-nums">{w.days}</td>
                  <td className="py-2 pr-3 tabular-nums">{w.contextPerFocusHour ?? "—"}</td>
                  <td className="py-2 pr-3 tabular-nums">{w.meanTimeToCloseMinutes === null ? "—" : `${w.meanTimeToCloseMinutes}m`}</td>
                  <td className="py-2 pr-3 tabular-nums">{w.agedOverHour}</td>
                  <td className="py-2 pr-3 tabular-nums">{pct(w.defectionAcceptRate)}</td>
                  <td className="py-2 pr-3"><StateBadge state={w.state} empty="Baseline" />{w.forgiven && <span className="ml-2 text-xs text-zinc-500">forgiven</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel kicker="Coming week" title="What's set up">
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
          {mirror.coming.map((line) => <li key={line}>{line}</li>)}
        </ul>
        {!mirror.hasDemo && <Button size="sm" variant="ghost" className="mt-3" onClick={() => store.loadDemoHistory()}>Add demo history to compare</Button>}
      </Panel>
    </div>
  );
}
