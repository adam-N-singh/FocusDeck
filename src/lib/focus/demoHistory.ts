import type { DayRecord } from "./history";
import { simulatePolicyDay } from "./policySim";
import { weekStartOf } from "./mirror";

/**
 * A seeded, clearly labelled demo history so the mirror has something to show
 * before you have real weeks. Generated from the policy simulator, so its
 * numbers are internally consistent: someone tightening their review
 * cadence, one heavier week, and the climb that forgives it. Every record carries `demo: true`
 * and the mirror says so; it is never mixed silently with real days.
 */
const PHASES = [
  { reviewEveryMinutes: 120, acceptRate: 0.12, parallelAgents: 4 },
  { reviewEveryMinutes: 90, acceptRate: 0.2, parallelAgents: 4 },
  { reviewEveryMinutes: 120, acceptRate: 0.04, parallelAgents: 7 }, // a heavier week: more agents, the cadence slipped
  { reviewEveryMinutes: 60, acceptRate: 0.32, parallelAgents: 4 }, // ...and the climb that forgives it
];

const addDays = (day: string, n: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
};

const isWeekday = (day: string) => {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return dow >= 1 && dow <= 5;
};

export function generateDemoHistory(today: string, weeks = 4, seed = 7): DayRecord[] {
  const first = addDays(weekStartOf(today), -7 * (weeks - 1));
  const records: DayRecord[] = [];
  for (let day = first, i = 0; day < today; day = addDays(day, 1), i++) {
    if (!isWeekday(day)) continue;
    const week = Math.min(PHASES.length - 1, Math.floor(i / 7));
    const phase = PHASES[week];
    const sim = simulatePolicyDay({ seed: seed * 1000 + i, durationMinutes: 480, policy: "focusdeck-strict", ...phase });
    const notAccepted = sim.offersShown - sim.offersAccepted;
    const dismissed = Math.round(notAccepted * 0.6);
    records.push({
      day,
      demo: true,
      focusMinutes: Math.round(480 - sim.supervisionMinutes - sim.lostByCause.feed - sim.lostByCause.notifications),
      totalSwitches: sim.totalSwitches,
      contextSwitches: sim.contextSwitches,
      interruptions: sim.interruptions,
      heldBack: sim.heldBack,
      warnings: sim.warningCount,
      loopsOpened: sim.loopsOpened,
      loopsClosed: sim.loopsOpened,
      openLoopMinutes: sim.openLoopMinutes,
      meanTimeToCloseMinutes: sim.loopsOpened > 0 ? Math.round(sim.meanWaitMinutes) : null,
      agedOverHour: sim.maxWaitMinutes > 60 ? Math.max(1, Math.round(sim.loopsOpened * Math.min(0.5, Math.max(0, (sim.meanWaitMinutes - 30) / 90)))) : 0,
      offersShown: sim.offersShown,
      accepted: sim.offersAccepted,
      dismissed,
      skipped: notAccepted - dismissed,
      defectionsOffered: sim.offersShown,
      defectionsAccepted: sim.offersAccepted,
      quietMoments: 0,
      longestFocusStretchMinutes: sim.longestFocusStretchMinutes,
      estimatedLostMinutes: Math.round(sim.lostMinutes),
    });
  }
  return records;
}
