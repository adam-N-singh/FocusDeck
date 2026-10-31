import { simulatePolicyDay } from "./policySim";
import type { SimulationConfig } from "./simulator";

export interface StressRow {
  parallelAgents: number;
  reviewEveryMinutes: number;
  totalSwitches: number;
  contextSwitches: number;
  interruptions: number;
  interruptionsAvoided: number;
  openLoops: number;
  estimatedLostMinutes: number;
  warningCount: number;
  /** Mean minutes an agent blocked on you waited — open-loop ageing (README next step 2). */
  meanWaitMinutes: number;
  /** Share of agent-time spent working rather than waiting on you, 0..1. */
  agentUtilization: number;
  focusMinutes: number;
}

/** Defection-moment acceptance assumed by the legacy sweep. The Lab lets you vary it. */
export const SWEEP_ACCEPT_RATE = 0.3;

/**
 * Run one simulated day and reduce it to a comparable row. Pure and fast.
 *
 * This now runs the policy-aware simulator (policySim.ts): "never review"
 * (9999) is the status quo of reacting to every ping, and any other cadence
 * is FocusDeck's default rules with a scheduled review moment. The first
 * version replayed policy-independent events, so its open loops were always
 * 0 and reviewing more often looked worse — see BUILD-NOTES.md.
 */
export function runStressCell(config: SimulationConfig): StressRow {
  const never = config.reviewEveryMinutes >= 9999;
  const day = simulatePolicyDay({
    seed: config.seed,
    durationMinutes: config.durationMinutes,
    parallelAgents: config.parallelAgents,
    policy: never ? "ad-hoc" : "focusdeck",
    reviewEveryMinutes: config.reviewEveryMinutes,
    acceptRate: SWEEP_ACCEPT_RATE,
  });
  return {
    parallelAgents: config.parallelAgents,
    reviewEveryMinutes: config.reviewEveryMinutes,
    totalSwitches: day.totalSwitches,
    contextSwitches: day.contextSwitches,
    interruptions: day.interruptions,
    interruptionsAvoided: day.heldBack,
    openLoops: day.loopsOpened,
    estimatedLostMinutes: Math.round(day.lostMinutes),
    warningCount: day.warningCount,
    meanWaitMinutes: day.meanWaitMinutes,
    agentUtilization: day.agentUtilization,
    focusMinutes: Math.round(day.focusMinutes),
  };
}

/**
 * The actual stress test: sweep agent parallelism x review cadence.
 * Question it answers: does adding a deliberate Reviewing-agents cadence
 * recover focus as parallelism rises, or do open loops just accumulate?
 */
export function runStressSweep(
  agentCounts: number[] = [1, 2, 4, 6, 8],
  reviewCadences: number[] = [30, 60, 120, 9999],
  seed = 42,
): StressRow[] {
  return agentCounts.flatMap((parallelAgents) =>
    reviewCadences.map((reviewEveryMinutes) =>
      runStressCell({ seed, parallelAgents, reviewEveryMinutes, durationMinutes: 480 }),
    ),
  );
}
