import { describe, expect, it } from "vitest";
import { buildSystemOneState, decide } from "./decision";
import { GOVERNOR, emptyGovernor, governorAllows, recordDismiss, recordOfferShown } from "./governor";
import { DEMO_INTENTIONS } from "./model";
import { formatWait, summarizeLoops, type OpenLoop } from "./loops";
import { MODE_BY_ID } from "./modes";
import { decideInContext, type PolicyContext } from "./policy";
import type { FocusEvent } from "./types";

const event = (partial: Partial<FocusEvent>): FocusEvent => ({
  id: "t", atMinute: 600, kind: "notification", app: "slack", label: "test", modeAtEvent: "building", ...partial,
});

const ctx = (partial: Partial<PolicyContext> = {}): PolicyContext => ({
  modes: MODE_BY_ID, intentions: DEMO_INTENTIONS, quietFirstBuildHour: false, minutesInMode: 90,
  systemOneEnabled: true, paused: false, ...partial,
});

describe("policy: your declarations on top of the decision stack", () => {
  it("passes everything through, logged, when guarding is paused", () => {
    const d = decideInContext(event({ kind: "notification" }), "writing", ctx({ paused: true }));
    expect(d.source).toBe("paused");
    expect(d.action).toBe("needs-you-now");
  });

  it("lets your batch intention decide, quoting you, with no model call", () => {
    const d = decideInContext(event({ kind: "agent-finished" }), "building", ctx());
    expect(d.source).toBe("rules");
    expect(d.intentionId).toBe("i-finish-building");
    expect(d.systemOne).toBeUndefined();
  });

  it("makes the first build hour quiet once confirmed — quieter only, never louder", () => {
    const quiet = decideInContext(event({ kind: "agent-needs-input" }), "building", ctx({ quietFirstBuildHour: true, minutesInMode: 20 }));
    expect(quiet.action).toBe("batch-for-later");
    const later = decideInContext(event({ kind: "agent-needs-input" }), "building", ctx({ quietFirstBuildHour: true, minutesInMode: 75 }));
    expect(later.action).toBe("needs-you-now");
  });

  it("takes the safe default when System One is paused", () => {
    const d = decide(event({ kind: "notification" }), "comms", undefined, { systemOneEnabled: false });
    expect(d.source).toBe("safe-default");
    expect(d.action).toBe("batch-for-later");
  });

  it("builds a System One state from metadata only — no content field exists", () => {
    const { state, questions } = buildSystemOneState(event({ kind: "agent-finished", label: "secret message text" }), "building");
    expect(JSON.stringify(state)).not.toContain("secret");
    expect(Object.keys(state).sort()).toEqual(["app", "eventKind", "minuteOfDay", "minutesInMode", "mode", "modeIsProtected", "openLoops"]);
    expect(questions.map((q) => q.type)).toEqual(["noul", "score", "noul"]);
  });
});

describe("open loops", () => {
  const loop = (id: string, opened: number, closed?: number): OpenLoop => ({
    id, eventId: id, app: "claude-code", label: id, openedAtMinute: opened, batched: true, closedAtMinute: closed,
  });

  it("ages loops and admits the ones that waited over an hour", () => {
    const summary = summarizeLoops([loop("a", 0, 20), loop("b", 10, 100), loop("c", 50)], 120);
    expect(summary).toEqual({ open: 1, closed: 2, oldestOpenMinutes: 70, openLoopMinutes: 180, meanTimeToCloseMinutes: 55, agedOverHour: 2 });
  });

  it("formats waits plainly", () => {
    expect(formatWait(4.4)).toBe("4m");
    expect(formatWait(65)).toBe("1h 05m");
  });
});

describe("the frequency governor", () => {
  it("cools off after a dismiss, silently", () => {
    const gov = recordDismiss(emptyGovernor(), "defection", 100);
    expect(governorAllows(gov, "defection", 105).ok).toBe(false);
    expect(governorAllows(gov, "defection", 100 + GOVERNOR.coolOffMinutes).ok).toBe(true);
    expect(governorAllows(gov, "review-moment", 105).ok).toBe(true); // other moments are unaffected
  });

  it("caps proactive offers per hour but never governs an interruption your mode allowed", () => {
    let gov = emptyGovernor();
    for (let i = 0; i < GOVERNOR.maxProactiveOffersPerHour; i++) gov = recordOfferShown(gov, "defection", 100 + i);
    expect(governorAllows(gov, "defection", 110).ok).toBe(false);
    expect(governorAllows(gov, "interruption", 110).ok).toBe(true);
  });

  it("caps the switch warning at once an hour and three a day", () => {
    let gov = recordOfferShown(emptyGovernor(), "warning", 100);
    expect(governorAllows(gov, "warning", 130).ok).toBe(false);
    gov = recordOfferShown(recordOfferShown(gov, "warning", 200), "warning", 300);
    expect(governorAllows(gov, "warning", 500).ok).toBe(false);
  });
});
