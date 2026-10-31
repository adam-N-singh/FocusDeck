import { describe, expect, it } from "vitest";
import { generateDemoHistory } from "./demoHistory";
import type { DayRecord } from "./history";
import { buildMirror, buildWeeks, weekStartOf } from "./mirror";

const context = { reviewEveryMinutes: 60, openLoopsNow: 2, activeIntentions: 5, trapApps: 2, pendingProposals: 1 };

const day = (date: string, partial: Partial<DayRecord> = {}): DayRecord => ({
  day: date, focusMinutes: 300, totalSwitches: 200, contextSwitches: 50, interruptions: 4, heldBack: 10, warnings: 0,
  loopsOpened: 6, loopsClosed: 6, openLoopMinutes: 180, meanTimeToCloseMinutes: 30, agedOverHour: 0, offersShown: 6,
  accepted: 2, dismissed: 3, skipped: 1, defectionsOffered: 5, defectionsAccepted: 1, quietMoments: 0,
  longestFocusStretchMinutes: 40, estimatedLostMinutes: 120, ...partial,
});

describe("the weekly honest mirror", () => {
  it("groups days into Monday-based weeks", () => {
    expect(weekStartOf("2026-10-31")).toBe("2026-10-26"); // a Saturday → its Monday
    expect(weekStartOf("2026-10-26")).toBe("2026-10-26");
  });

  it("names the trend with a state word, and forgives a drift once you climb", () => {
    const weeks = buildWeeks([
      day("2026-10-06", { contextSwitches: 50, meanTimeToCloseMinutes: 30 }),
      day("2026-10-13", { contextSwitches: 80, meanTimeToCloseMinutes: 50 }), // drift
      day("2026-10-20", { contextSwitches: 40, meanTimeToCloseMinutes: 20 }), // climb
    ]);
    expect(weeks.map((w) => w.state)).toEqual([null, "Drifting", "Climbing"]);
    expect(weeks[1].forgiven).toBe(true);
  });

  it("keeps cumulative evidence rising as days are added — it never goes down", () => {
    const history = [day("2026-10-20"), day("2026-10-21", { accepted: 0, loopsClosed: 0, focusMinutes: 0 })];
    const before = buildMirror(history.slice(0, 1), "2026-10-21", context).cumulative.map((c) => c.value);
    const after = buildMirror(history, "2026-10-21", context).cumulative.map((c) => c.value);
    after.forEach((value, i) => expect(value).toBeGreaterThanOrEqual(before[i]));
  });

  it("admits misses plainly but never counts a dismissal as one", () => {
    const mirror = buildMirror([day("2026-10-27", { agedOverHour: 2, dismissed: 9, warnings: 1 })], "2026-10-28", context);
    expect(mirror.misses.map((m) => m.label).join(" ")).not.toMatch(/dismiss|set aside/i);
    expect(mirror.misses.find((m) => m.label.includes("over an hour"))?.count).toBe(2);
  });

  it("offers exactly one supportive statement, with real numbers", () => {
    const mirror = buildMirror([
      day("2026-10-20", { meanTimeToCloseMinutes: 40 }),
      day("2026-10-27", { meanTimeToCloseMinutes: 20 }),
    ], "2026-10-28", context);
    expect(mirror.supportive).toBe("Agents waited 20m on average this week, down from 40m. Your review moment is doing the work.");
    expect(mirror.coming).toContain("2 open loops carrying into the week.");
  });

  it("generates a deterministic, clearly labelled demo history of weekdays", () => {
    const history = generateDemoHistory("2026-10-31");
    expect(history).toEqual(generateDemoHistory("2026-10-31"));
    expect(history.every((d) => d.demo)).toBe(true);
    expect(history.every((d) => ![0, 6].includes(new Date(`${d.day}T00:00:00Z`).getUTCDay()))).toBe(true);
    const mirror = buildMirror(history, "2026-10-31", context);
    expect(mirror.hasDemo).toBe(true);
    expect(mirror.weeks.length).toBe(4);
  });

  it("speaks about last week until this week has data", () => {
    const mirror = buildMirror([day("2026-10-27")], "2026-11-02", context);
    expect(mirror.isCurrentWeek).toBe(false);
    expect(mirror.thisWeek?.weekStart).toBe("2026-10-26");
  });
});
