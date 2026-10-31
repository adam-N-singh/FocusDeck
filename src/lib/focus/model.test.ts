import { describe, expect, it } from "vitest";
import { draftIntentionText, matchIntention, type ImplementationIntention } from "./intentions";
import { MAX_TRAP_APPS, createBlankModel, createDemoModel, normalizeModel, validateModel } from "./model";
import { MODES, describeModeRule, kindPolicy, withKindPolicy } from "./modes";

describe("the declared model", () => {
  it("ships a demo model and a blank model that are both valid", () => {
    expect(validateModel(createDemoModel())).toEqual([]);
    expect(validateModel(createBlankModel())).toEqual([]);
  });

  it("starts the blank model with nothing designated — per-app opt-in", () => {
    const blank = createBlankModel();
    expect(blank.designatedApps).toEqual([]);
    expect(blank.trapApps).toEqual([]);
  });

  it("caps trap apps and requires them to be designated", () => {
    const model = { ...createDemoModel(), trapApps: ["browser-x", "slack", "calendar", "notes"] as const };
    expect(validateModel({ ...model, trapApps: [...model.trapApps] }).some((p) => p.includes(`at most ${MAX_TRAP_APPS}`))).toBe(true);
    const undesignated = { ...createDemoModel(), designatedApps: ["editor" as const] };
    expect(validateModel(undesignated).some((p) => p.includes("must be designated"))).toBe(true);
  });

  it("rejects 'batch' for a defection moment and requires the review mode", () => {
    const model = createDemoModel();
    model.intentions = [{ ...model.intentions[0], then: "batch" }];
    expect(validateModel(model).some((p) => p.includes("only agent and notification moments"))).toBe(true);
    const noReview = { ...createDemoModel(), modes: MODES.filter((m) => m.id !== "reviewing-agents") };
    expect(validateModel(noReview).some((p) => p.includes("Reviewing agents mode is required"))).toBe(true);
  });

  it("round-trips through storage and drops anything it doesn't recognise", () => {
    const model = createDemoModel();
    expect(normalizeModel(JSON.parse(JSON.stringify(model)))).toEqual(model);
    const tampered = { ...JSON.parse(JSON.stringify(model)), designatedApps: ["editor", "keylogger"], reviewEveryMinutes: 2, windowTitles: ["secret"] };
    const loaded = normalizeModel(tampered)!;
    expect(loaded.designatedApps).toEqual(["editor"]);
    expect(loaded.reviewEveryMinutes).toBe(15);
    expect("windowTitles" in loaded).toBe(false);
    expect(normalizeModel({ hello: "world" })).toBeNull();
  });
});

describe("modes as declared rules", () => {
  it("describes each mode's rule in plain English, generated from its settings", () => {
    const building = MODES.find((m) => m.id === "building")!;
    expect(describeModeRule(building)).toBe(
      "Belongs here: Editor, Terminal, Browser — docs. May interrupt: an agent blocked on you. System One judges: an agent finishing. Everything else waits for you, viewable anytime.",
    );
  });

  it("never lets a blocked agent be model-gated", () => {
    const writing = MODES.find((m) => m.id === "writing")!;
    const edited = withKindPolicy(writing, "agent-needs-input", "decide");
    expect(kindPolicy(edited, "agent-needs-input")).toBe("interrupt");
    expect(edited.ambiguous).not.toContain("agent-needs-input");
  });
});

describe("mode-scoped implementation intentions", () => {
  const base: Omit<ImplementationIntention, "id" | "mode" | "app"> = { text: "t", when: "opens-trap", then: "queue-top", enabled: true };
  const intentions: ImplementationIntention[] = [
    { ...base, id: "any", mode: "any" },
    { ...base, id: "x-any", mode: "any", app: "browser-x" },
    { ...base, id: "building", mode: "building" },
    { ...base, id: "x-building", mode: "building", app: "browser-x" },
    { ...base, id: "off", mode: "building", app: "browser-x", enabled: false },
  ];

  it("picks the most specific enabled match", () => {
    expect(matchIntention(intentions, { when: "opens-trap", mode: "building", app: "browser-x" })?.id).toBe("x-building");
    expect(matchIntention(intentions, { when: "opens-trap", mode: "building", app: "slack" })?.id).toBe("building");
    expect(matchIntention(intentions, { when: "opens-trap", mode: "writing", app: "browser-x" })?.id).toBe("x-any");
    expect(matchIntention(intentions, { when: "opens-trap", mode: "writing", app: "slack" })?.id).toBe("any");
    expect(matchIntention(intentions, { when: "agent-blocks", mode: "writing" })).toBeNull();
  });

  it("drafts a sentence the user can rewrite in their own words", () => {
    expect(draftIntentionText({ when: "opens-trap", app: "browser-x", mode: "building", then: "tasks" }, MODES)).toBe(
      "When I open Browser — X during Building, show me my tasks.",
    );
  });
});
