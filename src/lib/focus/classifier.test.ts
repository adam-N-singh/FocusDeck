import { describe, expect, it } from "vitest";
import { classifyNotification } from "./classifier";
import { POST_DAY_EVENTS } from "./scenarios";
import type { FocusEvent } from "./types";

const event = (partial: Partial<FocusEvent>): FocusEvent => ({
  id: "t", atMinute: 0, kind: "notification", app: "slack", label: "test", modeAtEvent: "building", ...partial,
});

describe("classifyNotification", () => {
  it("lets a blocked agent interrupt Building mode", () => {
    expect(classifyNotification(event({ kind: "agent-needs-input" }), "building").classification).toBe("needs-you-now");
  });

  it("batches (never suppresses) a blocked agent in Writing mode, as an open loop", () => {
    expect(classifyNotification(event({ kind: "agent-needs-input" }), "writing").classification).toBe("batch-for-later");
  });

  it("suppresses a Slack notification in Building mode", () => {
    expect(classifyNotification(event({ kind: "notification" }), "building").classification).toBe("suppress-in-mode");
  });

  it("treats agent events as the work itself in Reviewing-agents mode", () => {
    expect(classifyNotification(event({ kind: "agent-finished" }), "reviewing-agents").classification).toBe("needs-you-now");
  });

  it("classifies the post's blocked-agent-in-Writing beat as batched", () => {
    const blocked = POST_DAY_EVENTS.find((e) => e.id === "p10")!;
    expect(classifyNotification(blocked, blocked.modeAtEvent).classification).toBe("batch-for-later");
  });
});
