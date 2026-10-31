import { computeMetrics, estimatedLostMinutes } from "./metrics";
import { simulateDay, type SimulationConfig } from "./simulator";

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
}

/** Run one simulated day and reduce it to a comparable row. Pure and fast. */
export function runStressCell(config: SimulationConfig): StressRow {
  const metrics = computeMetrics(simulateDay(config));
  return {
    parallelAgents: config.parallelAgents,
    reviewEveryMinutes: config.reviewEveryMinutes,
    totalSwitches: metrics.totalSwitches,
    contextSwitches: metrics.contextSwitches,
    interruptions: metrics.interruptions,
    interruptionsAvoided: metrics.interruptionsAvoided,
    openLoops: metrics.openLoops,
    estimatedLostMinutes: estimatedLostMinutes(metrics),
    warningCount: metrics.warningCount,
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
