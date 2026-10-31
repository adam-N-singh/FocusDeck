import { describe, expect, it } from "vitest";
import { computeMetrics, estimatedLostMinutes } from "./metrics";
import { POST_DAY_EVENTS } from "./scenarios";
import type { FocusEvent } from "./types";

describe("computeMetrics on the X-post day", () => {
  const metrics = computeMetrics(POST_DAY_EVENTS);

  it("counts every app switch, and flags out-of-mode ones as context switches", () => {
    expect(metrics.totalSwitches).toBe(6);
    // slack, claude-code, browser-x are all outside Building's allow-list
    expect(metrics.contextSwitches).toBe(3);
  });

  it("counts the blocked agent in Writing as an open loop, not an interruption", () => {
    expect(metrics.openLoops).toBe(1);
    expect(metrics.interruptionsAvoided).toBeGreaterThanOrEqual(2); // p9 notification + p10 blocked agent
  });

  it("estimates a positive refocus cost", () => {
    expect(estimatedLostMinutes(metrics)).toBeGreaterThan(0);
  });

  it("doesn't bill a review moment as interruptions — in Reviewing agents, agent events are the work", () => {
    const review: FocusEvent[] = [
      { id: "r1", atMinute: 0, kind: "agent-finished", app: "claude-code", label: "done", modeAtEvent: "reviewing-agents" },
      { id: "r2", atMinute: 2, kind: "agent-needs-input", app: "cursor-agent", label: "blocked", modeAtEvent: "reviewing-agents" },
    ];
    const reviewMetrics = computeMetrics(review);
    expect(reviewMetrics.interruptions).toBe(0);
    expect(reviewMetrics.attendedInMode).toBe(2);
    expect(estimatedLostMinutes(reviewMetrics)).toBe(1);
  });
});
