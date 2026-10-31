import { describe, expect, it } from "vitest";
import { DEMO_QUEUE, selectOffer, type QueueItem } from "./offer";

const item = (partial: Partial<QueueItem>): QueueItem => ({
  id: "x", kind: "task", title: "t", microAction: "do it", priority: 1, estimatedMinutes: 1, ...partial,
});

describe("selectOffer (Hymah Spec §3.3 ordering, twist tier added)", () => {
  it("puts a blocked agent ahead of tasks — open loops first", () => {
    expect(selectOffer(DEMO_QUEUE)?.kind).toBe("blocked-agent");
  });

  it("falls back to tasks, then intentions, then declared interests", () => {
    expect(selectOffer([item({ kind: "interest" }), item({ kind: "intention" })])?.kind).toBe("intention");
    expect(selectOffer([item({ kind: "interest" })])?.kind).toBe("interest");
  });

  it("returns null for an empty queue (no invented offers, no discovery)", () => {
    expect(selectOffer([])).toBeNull();
  });
});
