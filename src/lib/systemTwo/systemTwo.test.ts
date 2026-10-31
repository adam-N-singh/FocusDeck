import { describe, expect, it } from "vitest";
import { reduceDeck } from "../focus/deck/reducer";
import { createDeck, type DeckAction } from "../focus/deck/state";
import { generateDemoHistory } from "../focus/demoHistory";
import { buildMirror } from "../focus/mirror";
import { createDemoModel } from "../focus/model";
import { toModeMap } from "../focus/modes";
import { draftProposals, synthesizeWeek, type SystemTwoClient } from "./claude";
import { buildSynthesisPayload, sanitizeSynthesisPayload, templateSynthesis } from "./payload";
import { applyProposal, buildProposalPayload, parseProposals, sanitizeProposalPayload } from "./proposals";

const model = createDemoModel();
const ctx = { model, modes: toModeMap(model.modes) };
const mirror = buildMirror(generateDemoHistory("2026-10-31"), "2026-10-31", { reviewEveryMinutes: 60, openLoopsNow: 1, activeIntentions: 5, trapApps: 2, pendingProposals: 0 });

const fakeClient = (reply: { stop_reason: string; text?: string } | Error): SystemTwoClient =>
  ({
    beta: {
      messages: {
        create: async () => {
          if (reply instanceof Error) throw reply;
          return { stop_reason: reply.stop_reason, model: "claude-opus-5-5", content: reply.text ? [{ type: "text", text: reply.text }] : [] };
        },
      },
    },
  }) as unknown as SystemTwoClient;

describe("System Two sees aggregates and your declared words — nothing a sensor observed", () => {
  it("builds a proposal payload without event labels, sources or timestamps", () => {
    const actions: DeckAction[] = [
      { type: "event", at: 545, input: { kind: "agent-needs-input", app: "claude-code", source: "sess9f2", label: "SECRET-LABEL" } },
      { type: "event", at: 546, input: { kind: "app-switch", app: "slack" } },
    ];
    const deck = actions.reduce((d, a) => reduceDeck(d, a, ctx), createDeck("2026-10-31", 540, "building"));
    const json = JSON.stringify(buildProposalPayload(model, deck, 30));
    expect(json).not.toContain("SECRET-LABEL");
    expect(json).not.toContain("sess9f2");
    expect(json).toContain("When I open X during Building"); // your own words are allowed
    expect(json).toContain('"switchTargets":[{"mode":"building","app":"slack","count":1}]');
  });

  it("re-validates payloads on the server, dropping anything extra", () => {
    const tampered = { ...buildSynthesisPayload(mirror, ["When I…"]), events: [{ label: "x" }], windowTitles: ["secret"] };
    const clean = sanitizeSynthesisPayload(tampered)!;
    expect(JSON.stringify(clean)).not.toMatch(/windowTitles|events|secret/);
    expect(sanitizeProposalPayload({ hello: 1 })).toBeNull();
  });

  it("falls back to a plain template with the same facts", () => {
    const text = templateSynthesis(buildSynthesisPayload(mirror, []));
    expect(text).toMatch(/^This is demo data\. This week reads climbing\./);
    expect(text).not.toMatch(/!/);
  });
});

describe("System Two calls", () => {
  const synthesis = buildSynthesisPayload(mirror, []);

  it("returns the paragraph when Claude answers", async () => {
    const result = await synthesizeWeek(synthesis, fakeClient({ stop_reason: "end_turn", text: "A quiet, climbing week." }));
    expect(result).toEqual({ ok: true, value: "A quiet, climbing week.", model: "claude-opus-5-5" });
  });

  it("treats a refusal as unavailable instead of reading empty content", async () => {
    const result = await synthesizeWeek(synthesis, fakeClient({ stop_reason: "refusal" }));
    expect(result.ok).toBe(false);
  });

  it("explains missing credentials without throwing", async () => {
    const result = await synthesizeWeek(synthesis, fakeClient(new Error("Could not resolve authentication method. Expected either apiKey or authToken to be set.")));
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/ANTHROPIC_API_KEY/) });
  });

  it("parses drafted proposals and keeps only ones that trace to your model", async () => {
    const deck = createDeck("2026-10-31", 540);
    const payload = buildProposalPayload(model, deck, 52);
    const blank = { modeLabel: "", modeApps: [], intentionId: "", intentionText: "", when: "", mode: "", then: "" };
    const reply = {
      proposals: [
        { ...blank, kind: "new-mode", title: "A Standup mode", rationale: "Slack and Calendar pull you out of Building 14 times a day.", modeLabel: "Standup", modeApps: ["slack", "calendar"] },
        { ...blank, kind: "edit-intention", title: "Ghost", rationale: "Refers to nothing.", intentionId: "i-does-not-exist", intentionText: "x" },
        { ...blank, kind: "new-intention", title: "Shorter waits", rationale: "Agents waited 52m.", intentionText: "When my review moment arrives during Writing, show me the blocked agent first.", when: "review-moment", mode: "writing", then: "blocked-agents" },
      ],
    };
    const result = await draftProposals(payload, fakeClient({ stop_reason: "end_turn", text: JSON.stringify(reply) }));
    expect(result.ok && result.value.map((p) => p.kind)).toEqual(["new-mode", "new-intention"]);
  });
});

describe("confirming a proposal", () => {
  const payload = buildProposalPayload(model, createDeck("2026-10-31", 540), null);
  const blank = { modeLabel: "", modeApps: [], intentionId: "", intentionText: "", when: "", mode: "", then: "" };

  it("adds a new mode that keeps the model valid, and nothing happens until you confirm", () => {
    const [proposal] = parseProposals({ proposals: [{ ...blank, kind: "new-mode", title: "Standup", rationale: "r", modeLabel: "Standup", modeApps: ["slack"] }] }, payload);
    const next = applyProposal(model, proposal, "unused")!;
    expect(next.modes.at(-1)).toMatchObject({ id: "standup", label: "Standup", allowedApps: ["slack"], isProtected: true });
    expect(model.modes.some((m) => m.id === "standup")).toBe(false);
  });

  it("refuses a proposal that would make the model invalid", () => {
    const [proposal] = parseProposals({ proposals: [{ ...blank, kind: "new-intention", title: "Bad", rationale: "r", intentionText: "When I open X, batch it.", when: "opens-trap", mode: "any", then: "batch" }] }, payload);
    expect(applyProposal(model, proposal, "i-new")).toBeNull();
  });
});
