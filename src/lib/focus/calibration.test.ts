import { describe, expect, it } from "vitest";
import { calibrationReport, samplesFromDeck, type CalibrationSample } from "./calibration";
import { reduceDeck } from "./deck/reducer";
import { createDeck } from "./deck/state";
import { createDemoModel } from "./model";
import { toModeMap } from "./modes";
import { createRng } from "./simulator";

describe("the calibration spike", () => {
  it("calls a well-calibrated model calibrated", () => {
    const rng = createRng(5);
    const samples: CalibrationSample[] = Array.from({ length: 2000 }, () => {
      const p = rng();
      return { predicted: p, actual: rng() < p };
    });
    const report = calibrationReport(samples);
    expect(report.ece).toBeLessThan(0.05);
    expect(report.precisionAtThreshold).toBeGreaterThan(0.85);
    expect(report.verdict).toMatch(/^Calibrated enough/);
  });

  it("catches an overconfident model", () => {
    const samples: CalibrationSample[] = Array.from({ length: 100 }, (_, i) => ({ predicted: 0.9, actual: i % 2 === 0 }));
    const report = calibrationReport(samples);
    expect(report.precisionAtThreshold).toBe(0.5);
    expect(report.verdict).toMatch(/^Not calibrated/);
  });

  it("refuses to judge on too few labels", () => {
    expect(calibrationReport([{ predicted: 0.9, actual: true }]).verdict).toMatch(/^Not enough labels/);
  });

  it("reads labeled ambiguous events from the deck", () => {
    const model = createDemoModel();
    const ctx = { model, modes: toModeMap(model.modes) };
    let deck = reduceDeck(createDeck("2026-10-31", 540, "comms"), { type: "event", at: 545, input: { kind: "agent-finished", app: "claude-code" } }, ctx);
    const eventId = deck.events[0].id;
    deck = reduceDeck(deck, { type: "label-event", at: 546, eventId, needed: true }, ctx);
    expect(samplesFromDeck(deck)).toEqual([{ predicted: 0.4, actual: true }]);
  });
});
