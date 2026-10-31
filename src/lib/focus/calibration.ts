import type { DeckState } from "./deck/state";
import { DECISION_THRESHOLDS } from "./decision";

/**
 * The Jev spike question (DECISION-MODELS.md): "on *your* labeled week of
 * events, is Jev's confidence actually calibrated at the 0.8 threshold?"
 * Labels come from the activity log ("did this need you?"), so the ground
 * truth is yours. Works for any System One adapter — today the mock, later a
 * real Jev call — which is the point: evaluate before depending on it.
 */
export interface CalibrationSample {
  /** System One's probability that the event needed you now. */
  predicted: number;
  /** Your label: did it actually need you? */
  actual: boolean;
}

export interface CalibrationReport {
  n: number;
  threshold: number;
  buckets: { from: number; to: number; count: number; meanPredicted: number; observedRate: number }[];
  /** Expected calibration error: how far stated probabilities sit from observed rates (0 = perfect). */
  ece: number;
  brier: number;
  /** Of the calls at or above the act-now threshold, how many really needed you. */
  precisionAtThreshold: number | null;
  /** Of the calls below it, how many needed you after all (they waited for the review moment). */
  missRateBelowThreshold: number | null;
  verdict: string;
}

export const MIN_SAMPLES = 20;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function calibrationReport(samples: CalibrationSample[], threshold: number = DECISION_THRESHOLDS.actNow, bucketCount = 5): CalibrationReport {
  const buckets = Array.from({ length: bucketCount }, (_, i) => {
    const from = i / bucketCount;
    const to = (i + 1) / bucketCount;
    const inBucket = samples.filter((s) => s.predicted >= from && (i === bucketCount - 1 ? s.predicted <= to : s.predicted < to));
    const count = inBucket.length;
    return {
      from,
      to,
      count,
      meanPredicted: count ? round3(inBucket.reduce((sum, s) => sum + s.predicted, 0) / count) : 0,
      observedRate: count ? round3(inBucket.filter((s) => s.actual).length / count) : 0,
    };
  });
  const n = samples.length;
  const ece = n ? round3(buckets.reduce((sum, b) => sum + (b.count / n) * Math.abs(b.meanPredicted - b.observedRate), 0)) : 0;
  const brier = n ? round3(samples.reduce((sum, s) => sum + (s.predicted - (s.actual ? 1 : 0)) ** 2, 0) / n) : 0;
  const above = samples.filter((s) => s.predicted >= threshold);
  const below = samples.filter((s) => s.predicted < threshold);
  const precisionAtThreshold = above.length ? round3(above.filter((s) => s.actual).length / above.length) : null;
  const missRateBelowThreshold = below.length ? round3(below.filter((s) => s.actual).length / below.length) : null;

  let verdict: string;
  if (n < MIN_SAMPLES) verdict = `Not enough labels yet: ${n} of the ${MIN_SAMPLES} needed before this says anything. Label ambiguous events in the activity log.`;
  else if (ece <= 0.1 && (precisionAtThreshold ?? 0) >= threshold) verdict = `Calibrated enough to trust at ${threshold}: its confident calls were right ${Math.round(100 * (precisionAtThreshold ?? 0))}% of the time (ECE ${ece}).`;
  else verdict = `Not calibrated on your events (ECE ${ece}${precisionAtThreshold !== null ? `, ${Math.round(100 * precisionAtThreshold)}% right above ${threshold}` : ""}). Keep it off the hot path, or keep the safe default.`;

  return { n, threshold, buckets, ece, brier, precisionAtThreshold, missRateBelowThreshold, verdict };
}

/** Labeled samples from a deck: ambiguous events System One scored and you labeled. */
export function samplesFromDeck(deck: DeckState): CalibrationSample[] {
  return deck.log.flatMap((entry) =>
    entry.eventId !== undefined && entry.needsUserNow !== undefined && deck.labels[entry.eventId] !== undefined
      ? [{ predicted: entry.needsUserNow, actual: deck.labels[entry.eventId] }]
      : [],
  );
}
