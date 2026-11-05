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
import { Badge, Button, Disclosure, Section, Skeleton } from "@/components/ui/primitives";

const pct = (x: number | null) => (x === null ? "none yet" : `${Math.round(x * 100)}%`);

/**
 * Your week: a direction instead of a score, evidence that only adds up, how
 * long agents waited, and the misses counted plainly. Private and quiet —
 * never a shame machine.
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

  if (!state.hydrated) return <Skeleton lines={6} />;

  if (mirror.weeks.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-line-strong/70 px-6 py-10 sm:px-10">
        <p className="text-2xl font-semibold tracking-tight text-ink">Nothing to look back on yet.</p>
        <p className="mt-2 max-w-[56ch] text-base leading-7 text-ink-2">
          Once FocusDeck has seen a day, through a sensor or test moments on Now, your week shows up here. To see what it will look like, load four weeks of sample history. It’s clearly marked, and you can remove it anytime.
        </p>
        <Button className="mt-6" variant="primary" size="lg" onClick={() => store.loadDemoHistory()}>Load sample history</Button>
      </div>
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
    <div className="space-y-14">
      {mirror.hasDemo && (
        <div className="hatch flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-5 py-3">
          <p className="text-sm text-ink-2">Some of these weeks are sample data. They’re marked, and never mixed silently with yours.</p>
          <Button size="sm" onClick={() => store.clearDemoHistory()}>Remove sample history</Button>
        </div>
      )}

      <section aria-labelledby="trend-title" className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div>
          <h2 id="trend-title" className="text-sm text-ink-2">{mirror.isCurrentWeek ? "This week so far" : "Last week"}</h2>
          <p className="mt-3">
            <StateBadge state={mirror.state} size="lg" />
          </p>
          {mirror.supportive && <p className="mt-5 max-w-[46ch] text-lg leading-8 text-ink">{mirror.supportive}</p>}
          <p className="mt-4 max-w-[52ch] text-sm leading-6 text-ink-3">
            Compared with the week before on switches per focus hour, how long agents waited, and how often you chose your own offer. There’s no score, only a direction.
          </p>
        </div>
        <TrendSparkline weeks={mirror.weeks} />
      </section>

      <Section title="Adding up" description="These only ever go up.">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
          {mirror.cumulative.map((c) => (
            <div key={c.label}>
              <dt className="text-sm text-ink-2">{c.label}</dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight text-ink tabular-nums">{`${c.value}${c.unit ?? ""}`}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <div className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-16">
        <Section title="How long agents waited" description="Average minutes from an agent getting stuck to you answering it, week by week.">
          <WaitBars weeks={mirror.weeks} />
        </Section>
        <Section title="Misses" description="Counted plainly. Setting an offer aside is never a miss.">
          {week && mirror.misses.length > 0 ? (
            <ul className="divide-y divide-line border-y border-line">
              {mirror.misses.map((m) => (
                <li key={m.label} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
                  <span className="text-ink-2">{m.label}</span>
                  <span className="text-base font-medium text-ink tabular-nums">{m.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">No misses to count.</p>
          )}
        </Section>
      </div>

      <Section
        title="The week in a paragraph"
        actions={model.systemTwoEnabled ? <Button size="sm" disabled={busy} onClick={() => void writeParagraph()}>{busy ? "Writing…" : "Ask the AI helper"}</Button> : undefined}
      >
        <p className="max-w-[64ch] text-lg leading-8 text-ink">{synthesis?.text ?? templateSynthesis(payload)}</p>
        <p className="mt-3 max-w-[64ch] text-sm leading-6 text-ink-3">
          {synthesis?.source === "system-two"
            ? `Written by the AI helper (${synthesis.model}) from the numbers on this page and your if-then plans, nothing else.`
            : synthesis?.note ?? (model.systemTwoEnabled ? "This is the plain version. The AI helper can write it as a paragraph." : "This is the plain version. Turn on the AI helper in Setup to have it written as a paragraph.")}
        </p>
      </Section>

      <Section title="Next week" description="What’s already set up for you.">
        <ul className="max-w-[64ch] space-y-2 text-base leading-7 text-ink">
          {mirror.coming.map((line) => (
            <li key={line} className="flex gap-3">
              <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" />
              {line}
            </li>
          ))}
        </ul>
      </Section>

      <div className="space-y-1 border-t border-line pt-5">
        <Disclosure title="Week by week, as a table">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-ink-3">
                  {["Week of", "Days", "Switches outside mode per focus hour", "Average agent wait", "Agents over an hour", "Chose your offer", "Direction"].map((h) => (
                    <th key={h} className="py-2 pr-4 align-bottom font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...mirror.weeks].reverse().map((w) => (
                  <tr key={w.weekStart} className="border-t border-line text-ink">
                    <td className="py-2.5 pr-4">
                      {w.weekStart}
                      {w.demo && <span className="ml-2"><Badge tone="outline">sample</Badge></span>}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums">{w.days}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{w.contextPerFocusHour ?? "none"}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{w.meanTimeToCloseMinutes === null ? "none" : `${w.meanTimeToCloseMinutes}m`}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{w.agedOverHour}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{pct(w.defectionAcceptRate)}</td>
                    <td className="py-2.5 pr-4">
                      <StateBadge state={w.state} empty="Baseline" />
                      {w.forgiven && <span className="ml-2 text-xs text-ink-3">forgiven</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Disclosure>
        {!mirror.hasDemo && (
          <Button size="sm" variant="ghost" className="-ml-3" onClick={() => store.loadDemoHistory()}>Add sample history to compare</Button>
        )}
      </div>
    </div>
  );
}
