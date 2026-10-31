import { describe, expect, it } from "vitest";
import { decide, mockSystemOne } from "./decision";
import type { FocusEvent } from "./types";

const event = (partial: Partial<FocusEvent>): FocusEvent => ({
  id: "t", atMinute: 0, kind: "notification", app: "slack", label: "test", modeAtEvent: "building", ...partial,
});

describe("decide — the decision stack", () => {
  it("lets rules decide definitive cases without calling a model", () => {
    const decision = decide(event({ kind: "agent-needs-input" }), "writing");
    expect(decision.source).toBe("rules");
    expect(decision.action).toBe("batch-for-later");
  });

  it("sends ambiguous residue to the System One model", () => {
    const decision = decide(event({ kind: "agent-finished" }), "building");
    expect(decision.source).toBe("jev");
    expect(decision.systemOne).toBeDefined();
  });

  it("defaults to batch (never suppress) when the model is unsure", () => {
    const unsure = () => ({ needsUserNow: 0.5, urgency: 0.5, isDefection: 0.5, confidence: 0.3 });
    const decision = decide(event({ kind: "notification" }), "comms", unsure);
    expect(decision.source).toBe("jev-low-confidence");
    expect(decision.action).toBe("batch-for-later");
  });

  it("mock System One is deterministic and metadata-shaped", () => {
    const e = event({ kind: "agent-needs-input" });
    expect(mockSystemOne(e, "building")).toEqual(mockSystemOne(e, "building"));
    expect(mockSystemOne(e, "building").needsUserNow).toBeGreaterThan(0.8);
  });
});
