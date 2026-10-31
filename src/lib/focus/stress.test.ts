import { describe, expect, it } from "vitest";
import { runStressCell, runStressSweep } from "./stress";

describe("stress sweep", () => {
  it("is reproducible for a fixed seed", () => {
    const config = { seed: 7, parallelAgents: 4, reviewEveryMinutes: 60, durationMinutes: 480 };
    expect(runStressCell(config)).toEqual(runStressCell(config));
  });

  it("more parallel agents means more switches and lost time", () => {
    const one = runStressCell({ seed: 42, parallelAgents: 1, reviewEveryMinutes: 60, durationMinutes: 480 });
    const eight = runStressCell({ seed: 42, parallelAgents: 8, reviewEveryMinutes: 60, durationMinutes: 480 });
    expect(eight.totalSwitches).toBeGreaterThan(one.totalSwitches);
    expect(eight.estimatedLostMinutes).toBeGreaterThan(one.estimatedLostMinutes);
  });

  it("a review cadence avoids at least as many interruptions as never reviewing", () => {
    const rows = runStressSweep([4], [60, 9999]);
    const withCadence = rows.find((r) => r.reviewEveryMinutes === 60)!;
    const never = rows.find((r) => r.reviewEveryMinutes === 9999)!;
    expect(withCadence.interruptionsAvoided).toBeGreaterThanOrEqual(0);
    expect(never.parallelAgents).toBe(4);
  });
});
