import { DEFAULT_BEHAVIOUR, LOST_CAUSES, simulatePolicyDay, type Behaviour, type LostCause, type PolicyDay, type PolicyId, type PolicySimConfig, type SimCosts } from "./policySim";

/**
 * The three questions PRODUCT.md says the stress test must answer, answered
 * from the policy simulator — averaged over seeds, every number traceable to
 * the assumptions in policyConfig.ts. Each answer names the telemetry that
 * would falsify it, because simulation only tells us what to measure.
 */
export const DEFAULT_SEEDS = [11, 23, 42, 77, 101];

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Mean of every field over several seeds — single seeds are anecdotes. */
export function averageDays(days: PolicyDay[]): PolicyDay {
  const mean = (pick: (d: PolicyDay) => number) => round1(days.reduce((s, d) => s + pick(d), 0) / Math.max(1, days.length));
  const keys = Object.keys(days[0] ?? {}) as (keyof PolicyDay)[];
  const out = Object.fromEntries(keys.filter((k) => k !== "lostByCause").map((k) => [k, mean((d) => d[k] as number)])) as unknown as PolicyDay;
  out.lostByCause = Object.fromEntries(LOST_CAUSES.map((k) => [k, mean((d) => d.lostByCause[k])])) as Record<LostCause, number>;
  out.agentUtilization = Math.round((1000 * days.reduce((s, d) => s + d.agentUtilization, 0)) / Math.max(1, days.length)) / 1000;
  return out;
}

export function simulateAveraged(config: Omit<PolicySimConfig, "seed">, seeds: number[] = DEFAULT_SEEDS): PolicyDay {
  return averageDays(seeds.map((seed) => simulatePolicyDay({ ...config, seed })));
}

/** Supervision minutes plus refocus lost to agents, per hour of work the agents actually did. */
export const supervisionCostPerAgentHour = (d: PolicyDay) =>
  round1((d.supervisionMinutes + d.lostByCause.agents) / Math.max(0.1, d.agentRunMinutes / 60));

export interface AnalysisParams {
  parallelAgents: number;
  acceptRate: number;
  reviewEveryMinutes: number;
  durationMinutes?: number;
  behaviour?: Partial<Behaviour>;
  costs?: Partial<SimCosts>;
  seeds?: number[];
  /** Your own measured acceptance at defection moments, if FocusDeck has seen any. */
  measuredAcceptRate?: number | null;
}

export interface QuestionAnswer {
  id: 1 | 2 | 3;
  question: string;
  verdict: "yes" | "no" | "trade-off" | "marginal";
  headline: string;
  findings: string[];
  falsifier: string;
}

const run = (p: AnalysisParams, policy: PolicyId, extra: Partial<PolicySimConfig> = {}) =>
  simulateAveraged({
    durationMinutes: p.durationMinutes ?? 480,
    parallelAgents: p.parallelAgents,
    policy,
    reviewEveryMinutes: p.reviewEveryMinutes,
    acceptRate: p.acceptRate,
    behaviour: p.behaviour,
    costs: p.costs,
    ...extra,
  }, p.seeds);

const pct = (x: number) => `${Math.round(100 * x)}%`;

export function answerQ1(p: AnalysisParams): QuestionAnswer {
  const unscoped = run(p, "hymah-unscoped");
  const scoped = run(p, "hymah-scoped");
  const loop = run(p, "focusdeck");
  const offerEffect = round1(unscoped.contextSwitches - scoped.contextSwitches);
  const loopEffect = round1(unscoped.contextSwitches - loop.contextSwitches);
  // Exact, not searched: an accepted unscoped offer leads out of the mode `crossModeOfferShare`
  // of the time and a scoped one never does, so scoping wins while its acceptance stays above
  // (1 - share) of the unscoped rate. The simulated difference is too small to search reliably.
  const crossShare = p.behaviour?.crossModeOfferShare ?? DEFAULT_BEHAVIOUR.crossModeOfferShare;
  const breakEvenRatio = 1 - crossShare;
  const offerShare = offerEffect / Math.max(1, unscoped.contextSwitches);
  return {
    id: 1,
    question: "Does mode-scoping the offer reduce context switches (not just total switches) versus an unscoped Hymah-style intercept?",
    verdict: offerShare < 0.03 ? "marginal" : offerEffect > 0 ? "yes" : "no",
    headline:
      offerShare < 0.03
        ? `Scoping the offer alone saves only ${offerEffect} context switches a day; mode-scoping the whole loop saves ${loopEffect} (${pct(loopEffect / Math.max(1, unscoped.contextSwitches))}). The win is in classification and batching, not the offer.`
        : `Yes: scoped offers save ${offerEffect} context switches a day at equal acceptance, and mode-scoping the whole loop saves ${loopEffect}.`,
    findings: [
      `Unscoped Hymah intercept: ${unscoped.contextSwitches} context switches a day (${unscoped.totalSwitches} total).`,
      `Same, with offers scoped to the mode: ${scoped.contextSwitches}. Defection offers are only ${unscoped.offersShown} moments a day, so they can't move the total much.`,
      `FocusDeck's mode-scoped loop (rules + batching + scoped offers): ${loop.contextSwitches}.`,
      `Scoped offers keep winning as long as they are accepted at least ${pct(breakEvenRatio)} as often as unscoped ones (an accepted unscoped offer leaves the mode ${pct(crossShare)} of the time).`,
    ],
    falsifier: "Telemetry check: context switches per focus hour with offer scoping on vs off, and whether scoped offers keep their acceptance rate.",
  };
}

export function answerQ2(p: AnalysisParams): QuestionAnswer {
  const adhoc = run(p, "ad-hoc", { reviewEveryMinutes: 9999 });
  const minutes = [...new Set([30, 60, 120, p.reviewEveryMinutes])].sort((a, b) => a - b);
  const cadences = minutes.map((reviewEveryMinutes) => ({ reviewEveryMinutes, day: run(p, "focusdeck-strict", { reviewEveryMinutes }) }));
  // Judge the cadence you chose, and show the others beside it.
  const best = cadences.find((c) => c.reviewEveryMinutes === p.reviewEveryMinutes) ?? cadences[0];
  const baseCost = supervisionCostPerAgentHour(adhoc);
  const bestCost = supervisionCostPerAgentHour(best.day);
  const savings = 1 - bestCost / Math.max(0.1, baseCost);
  const throughputDrop = 1 - best.day.agentUtilization / Math.max(0.001, adhoc.agentUtilization);
  const verdict: QuestionAnswer["verdict"] = savings < 0.1 ? "no" : throughputDrop > 0.15 ? "trade-off" : "yes";
  const headlines: Record<QuestionAnswer["verdict"], string> = {
    yes: `Cheaper and not just tidier: ${pct(savings)} less supervision per agent-hour at a ${best.reviewEveryMinutes}-minute cadence, with agent throughput nearly intact.`,
    "trade-off": `Not faster — reacting closes loops in ${adhoc.meanWaitMinutes}m vs ${best.day.meanWaitMinutes}m at a ${best.reviewEveryMinutes}-minute cadence — but cheaper: ${pct(savings)} less supervision per agent-hour. The price is agents idling: their throughput falls ${pct(throughputDrop)}.`,
    no: `Only tidier: a review cadence doesn't make supervision meaningfully cheaper per agent-hour (${baseCost} → ${bestCost} minutes) under these assumptions.`,
    marginal: "",
  };
  return {
    id: 2,
    question: "Does a scheduled Reviewing-agents cadence clear open loops faster than ad-hoc checking — i.e., does it make supervision cheaper, or only tidier?",
    verdict,
    headline: headlines[verdict],
    findings: [
      `Reacting to every ping: ${baseCost} supervision-minutes per agent-hour, agents busy ${pct(adhoc.agentUtilization)} of the time, ${adhoc.focusMinutes} minutes of your own focus.`,
      ...cadences.map(({ reviewEveryMinutes, day }) =>
        `Review every ${reviewEveryMinutes}m: ${supervisionCostPerAgentHour(day)} per agent-hour, agents wait ${day.meanWaitMinutes}m on average, busy ${pct(day.agentUtilization)}, your focus ${day.focusMinutes} minutes.`),
    ],
    falsifier: "Telemetry check: open-loop age and agent idle time at your real cadence. If supervision per agent-hour doesn't fall, the cadence only made things tidier.",
  };
}

export function answerQ3(p: AnalysisParams): QuestionAnswer {
  const feed = run(p, "focusdeck", { intercept: "none" });
  let breakEven: number | null = null;
  for (let i = 0; i <= 20; i++) {
    const a = i / 40; // 0% .. 50%
    if (run(p, "focusdeck", { acceptRate: a }).lostMinutes <= feed.lostMinutes) {
      breakEven = a;
      break;
    }
  }
  const atRate = run(p, "focusdeck", { acceptRate: p.acceptRate });
  const saved = round1(feed.lostMinutes - atRate.lostMinutes);
  const measured = p.measuredAcceptRate;
  const yourRate = measured === null || measured === undefined
    ? "FocusDeck hasn't seen enough defection moments to measure yours yet."
    : `Your measured acceptance so far: ${pct(measured)} — ${breakEven !== null && measured >= breakEven ? "above" : "below"} the break-even.`;
  return {
    id: 3,
    question: "At the defection moment (“opened X while waiting”), is a Hymah offer accepted often enough to beat the feed?",
    verdict: breakEven !== null && breakEven <= 0.25 ? "yes" : "no",
    headline: breakEven === null
      ? "No: under these costs an offer doesn't pay for itself below 50% acceptance."
      : `An offer beats the feed once it's accepted about ${pct(breakEven)} of the time. At ${pct(p.acceptRate)} it saves ${saved} minutes a day. The bar is low; whether real people clear it is a behavioural question only telemetry can answer.`,
    findings: [
      `Defection moments a day: ${feed.defections}. Each feed visit costs ~${feed.defections > 0 ? round1(feed.lostByCause.feed / feed.defections) : 0} minutes including the refocus.`,
      `Showing an offer costs ${p.costs?.offerDecision ?? 0.25} minutes of decision time, accepted or not.`,
      yourRate,
    ],
    falsifier: "Telemetry check: acceptance at defection moments (the mirror counts yours). Below the break-even, offers cost more than they save — simplify back.",
  };
}

export function answerAll(p: AnalysisParams): QuestionAnswer[] {
  return [answerQ1(p), answerQ2(p), answerQ3(p)];
}

export interface SweepCell {
  label: string;
  day: PolicyDay;
}

/** The Lab's table: rows of agent counts, columns of policies/cadences. */
export function runPolicySweep(
  agentCounts: number[],
  columns: { label: string; policy: PolicyId; reviewEveryMinutes: number }[],
  p: Omit<AnalysisParams, "parallelAgents" | "reviewEveryMinutes">,
): { parallelAgents: number; cells: SweepCell[] }[] {
  return agentCounts.map((parallelAgents) => ({
    parallelAgents,
    cells: columns.map((col) => ({ label: col.label, day: run({ ...p, parallelAgents, reviewEveryMinutes: col.reviewEveryMinutes }, col.policy) })),
  }));
}
