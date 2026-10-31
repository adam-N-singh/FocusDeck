import { describe, expect, it } from "vitest";
import { answerQ1, answerQ2, answerQ3, simulateAveraged, supervisionCostPerAgentHour } from "./policyAnalysis";
import { POLICIES, simulatePolicyDay, type PolicyId } from "./policySim";
import { runStressCell } from "./stress";

const base = { seed: 42, durationMinutes: 480, parallelAgents: 4, reviewEveryMinutes: 60, acceptRate: 0.3 };

describe("policy simulator: time is accounted honestly", () => {
  it.each(Object.keys(POLICIES) as PolicyId[])("%s accounts for every minute of the day, and never loses more than it has", (policy) => {
    for (const parallelAgents of [0, 1, 8]) {
      const day = simulatePolicyDay({ ...base, policy, parallelAgents });
      expect(day.lostMinutes + day.focusMinutes + day.supervisionMinutes).toBeCloseTo(480, 0);
      expect(day.lostMinutes).toBeLessThanOrEqual(480);
      expect(day.agentUtilization).toBeLessThanOrEqual(1);
    }
  });

  it("is reproducible for a seed", () => {
    expect(simulatePolicyDay({ ...base, policy: "focusdeck" })).toEqual(simulatePolicyDay({ ...base, policy: "focusdeck" }));
  });

  it("faces every policy with the same day (common random numbers)", () => {
    // An intercept that is never accepted changes nothing but the cost of asking.
    const feed = simulatePolicyDay({ ...base, policy: "ad-hoc" });
    const neverAccepted = simulatePolicyDay({ ...base, policy: "hymah-unscoped", acceptRate: 0 });
    expect(neverAccepted.contextSwitches).toBe(feed.contextSwitches);
    expect(neverAccepted.defections).toBe(feed.defections);
    expect(neverAccepted.lostMinutes).toBeGreaterThan(feed.lostMinutes);
  });
});

describe("policy simulator: the mechanics the questions rest on", () => {
  it("open loops exist and age when agents wait for a review — unlike the old replay", () => {
    const hourly = simulateAveraged({ ...base, policy: "focusdeck-strict" });
    const twoHourly = simulateAveraged({ ...base, policy: "focusdeck-strict", reviewEveryMinutes: 120 });
    expect(hourly.loopsOpened).toBeGreaterThan(0);
    expect(hourly.interruptions).toBe(0);
    expect(twoHourly.meanWaitMinutes).toBeGreaterThan(hourly.meanWaitMinutes);
    expect(twoHourly.agentUtilization).toBeLessThan(hourly.agentUtilization);
  });

  it("does not bill review moments as interruptions: batching buys back your own focus", () => {
    const react = simulateAveraged({ ...base, policy: "ad-hoc", reviewEveryMinutes: 9999 });
    const review = simulateAveraged({ ...base, policy: "focusdeck-strict" });
    expect(review.focusMinutes).toBeGreaterThan(react.focusMinutes * 2);
    expect(review.contextSwitches).toBeLessThan(react.contextSwitches / 2);
    expect(supervisionCostPerAgentHour(review)).toBeLessThan(supervisionCostPerAgentHour(react));
  });

  it("makes parallelism expensive when you react to every ping", () => {
    const one = simulateAveraged({ ...base, policy: "ad-hoc", parallelAgents: 1 });
    const eight = simulateAveraged({ ...base, policy: "ad-hoc", parallelAgents: 8 });
    expect(eight.contextSwitches).toBeGreaterThan(one.contextSwitches * 2);
    expect(eight.focusMinutes).toBeLessThan(one.focusMinutes / 4);
  });

  it("keeps the legacy stress-row API, now with open-loop ageing", () => {
    const row = runStressCell({ seed: 42, parallelAgents: 4, reviewEveryMinutes: 60, durationMinutes: 480 });
    expect(row.openLoops).toBeGreaterThan(0);
    expect(row.meanWaitMinutes).toBeGreaterThanOrEqual(0);
    expect(row.estimatedLostMinutes).toBeLessThanOrEqual(480);
  });
});

describe("the three questions (PRODUCT.md), under default assumptions", () => {
  const params = { parallelAgents: 4, acceptRate: 0.3, reviewEveryMinutes: 60 };

  it("Q1: the context-switch win comes from mode-scoped classification, not from scoping the offer", () => {
    const q1 = answerQ1(params);
    expect(q1.verdict).toBe("marginal");
    expect(q1.headline).toMatch(/whole loop saves/);
    expect(q1.findings).toHaveLength(4);
  });

  it("Q2: a review cadence makes supervision cheaper, at the price of agents waiting", () => {
    const q2 = answerQ2(params);
    expect(q2.verdict).toBe("trade-off");
    expect(q2.headline).toMatch(/cheaper/);
  });

  it("Q3: an offer beats the feed above a low acceptance bar — and says what telemetry must check", () => {
    const q3 = answerQ3({ ...params, measuredAcceptRate: 0.4 });
    expect(q3.verdict).toBe("yes");
    expect(q3.findings.join(" ")).toMatch(/above the break-even/);
    expect(q3.falsifier).toMatch(/Telemetry/);
  });
});
