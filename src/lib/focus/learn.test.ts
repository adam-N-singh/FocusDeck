import { describe, expect, it } from "vitest";
import { reduceDeck } from "./deck/reducer";
import { createDeck, type DeckAction, type DeckState } from "./deck/state";
import type { DayRecord } from "./history";
import { applyAnswer, decideHypothesis, deriveHypotheses, pickQuestion } from "./learn";
import { createDemoModel } from "./model";
import { toModeMap } from "./modes";

const model = createDemoModel();
const ctx = { model, modes: toModeMap(model.modes) };
const run = (deck: DeckState, actions: DeckAction[]) => actions.reduce((d, a) => reduceDeck(d, a, ctx), deck);
const record = (day: string, meanTimeToCloseMinutes: number | null): DayRecord => ({
  day, focusMinutes: 300, totalSwitches: 200, contextSwitches: 40, interruptions: 5, heldBack: 10, warnings: 0,
  loopsOpened: 8, loopsClosed: 8, openLoopMinutes: 300, meanTimeToCloseMinutes, agedOverHour: 1, offersShown: 6,
  accepted: 3, dismissed: 2, skipped: 1, defectionsOffered: 4, defectionsAccepted: 2, quietMoments: 0,
  longestFocusStretchMinutes: 40, estimatedLostMinutes: 120,
});

describe("boundary questions", () => {
  const deck = createDeck("2026-10-31", 540, "writing");

  it("asks the quiet-first-hour question when entering Building, and applies a yes", () => {
    const q = pickQuestion({ model, deck, enteringMode: "building", history: [] });
    expect(q?.id).toBe("quiet-first-build-hour");
    const updated = applyAnswer(model, q!.id, "yes", "2026-10-31");
    expect(updated.quietFirstBuildHour).toBe(true);
    expect(pickQuestion({ model: updated, deck, enteringMode: "building", history: [] })).toBeNull();
  });

  it("prefers a data-backed question when yesterday's agents waited long", () => {
    const q = pickQuestion({ model, deck, enteringMode: "writing", history: [record("2026-10-30", 58)] });
    expect(q?.text).toContain("about 58m");
    expect(applyAnswer(model, "faster-review", "yes", "2026-10-31").reviewEveryMinutes).toBe(30);
  });

  it("never re-asks after a no, but may ask again after a skip", () => {
    const no = applyAnswer(model, "quiet-first-build-hour", "no", "2026-10-30");
    expect(pickQuestion({ model: no, deck, enteringMode: "building", history: [] })).toBeNull();
    const skipped = applyAnswer(model, "quiet-first-build-hour", "skipped", "2026-10-30");
    expect(pickQuestion({ model: skipped, deck, enteringMode: "building", history: [] })?.id).toBe("quiet-first-build-hour");
  });
});

describe("inferences are proposals until you confirm them", () => {
  it("proposes adding an app you keep switching to, with its evidence, and changes nothing until confirmed", () => {
    const actions: DeckAction[] = [];
    for (let i = 0; i < 9; i++) actions.push({ type: "event", at: 541 + i, input: { kind: "app-switch", app: "terminal" } });
    const deck = run(createDeck("2026-10-31", 540, "writing"), actions);
    const [hypothesis] = deriveHypotheses({ model, deck, history: [] });
    expect(hypothesis.id).toBe("add-app:writing:terminal");
    expect(hypothesis.evidence).toContain("9×");
    expect(model.modes.find((m) => m.id === "writing")?.allowedApps).not.toContain("terminal");

    const confirmed = decideHypothesis(model, hypothesis, true, "2026-10-31");
    expect(confirmed.modes.find((m) => m.id === "writing")?.allowedApps).toContain("terminal");
    expect(deriveHypotheses({ model: confirmed, deck, history: [] })).toHaveLength(0);

    const rejected = decideHypothesis(model, hypothesis, false, "2026-10-31");
    expect(rejected.modes).toEqual(model.modes);
    expect(rejected.inferences[0].status).toBe("rejected");
    expect(deriveHypotheses({ model: rejected, deck, history: [] })).toHaveLength(0);
  });

  it("proposes a shorter review cadence when agents wait long", () => {
    const deck = createDeck("2026-10-31", 540, "building");
    const ids = deriveHypotheses({ model, deck, history: [record("2026-10-29", 50), record("2026-10-30", 62)] }).map((h) => h.id);
    expect(ids).toContain("cadence-30");
  });
});
