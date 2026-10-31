import { APP_IDS, isAppId } from "../focus/apps";
import type { DeckState } from "../focus/deck/state";
import type { ImplementationIntention, IntentionWhen, OfferTarget } from "../focus/intentions";
import { validateModel, type UserModel } from "../focus/model";
import { resolveMode, toModeMap } from "../focus/modes";
import type { AppId } from "../focus/types";
import { MAX_TEXT } from "./payload";

/**
 * System Two drafts; the user decides. Proposals are new modes or intention
 * edits drafted from declared words and aggregate patterns. They reach the
 * user as proposals — never silent changes — and a confirmed one must still
 * leave the model valid (Layer 4, DECISION-MODELS.md).
 */
export const MAX_PROPOSALS = 3;
const WHENS: IntentionWhen[] = ["opens-trap", "agent-blocks", "agent-finishes", "notification", "review-moment", "enters-mode"];
const TARGETS: OfferTarget[] = ["queue-top", "blocked-agents", "tasks", "intentions", "content", "interests", "batch"];

export interface ProposalPayload {
  modes: { id: string; label: string; apps: AppId[]; isProtected: boolean }[];
  intentions: { id: string; text: string; when: IntentionWhen; mode: string; then: OfferTarget; enabled: boolean }[];
  trapApps: AppId[];
  reviewEveryMinutes: number;
  /** Aggregates only: counts, never events. */
  patterns: {
    switchTargets: { mode: string; app: AppId; count: number }[];
    intentionResponses: { intentionId: string; accepted: number; dismissed: number; skipped: number }[];
    meanTimeToCloseMinutes: number | null;
  };
}

export function buildProposalPayload(model: UserModel, deck: DeckState, meanTimeToCloseMinutes: number | null): ProposalPayload {
  const modes = toModeMap(model.modes);
  const counts = new Map<string, { mode: string; app: AppId; count: number }>();
  for (const e of deck.events) {
    if (e.kind !== "app-switch" || e.origin === "manual" || resolveMode(modes, e.modeAtEvent).allowedApps.includes(e.app)) continue;
    const key = `${e.modeAtEvent}|${e.app}`;
    counts.set(key, { mode: e.modeAtEvent, app: e.app, count: (counts.get(key)?.count ?? 0) + 1 });
  }
  const responses = new Map<string, { intentionId: string; accepted: number; dismissed: number; skipped: number }>();
  for (const s of deck.signals) {
    if (!s.intentionId) continue;
    const r = responses.get(s.intentionId) ?? { intentionId: s.intentionId, accepted: 0, dismissed: 0, skipped: 0 };
    r[s.response] += 1;
    responses.set(s.intentionId, r);
  }
  return {
    modes: model.modes.map((m) => ({ id: m.id, label: m.label, apps: m.allowedApps, isProtected: m.isProtected !== false })),
    intentions: model.intentions.map(({ id, text, when, mode, then, enabled }) => ({ id, text, when, mode, then, enabled })),
    trapApps: model.trapApps,
    reviewEveryMinutes: model.reviewEveryMinutes,
    patterns: {
      switchTargets: [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 8),
      intentionResponses: [...responses.values()].slice(0, 12),
      meanTimeToCloseMinutes,
    },
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.slice(0, MAX_TEXT) : "");
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);

export function sanitizeProposalPayload(raw: unknown): ProposalPayload | null {
  if (!isRecord(raw) || !Array.isArray(raw.modes) || !Array.isArray(raw.intentions) || !isRecord(raw.patterns)) return null;
  const p = raw.patterns;
  return {
    modes: raw.modes.filter(isRecord).slice(0, 12).map((m) => ({ id: str(m.id), label: str(m.label), apps: (Array.isArray(m.apps) ? m.apps : []).filter(isAppId), isProtected: m.isProtected !== false })),
    intentions: raw.intentions.filter(isRecord).slice(0, 20).flatMap((i) => {
      const when = WHENS.find((w) => w === i.when);
      const then = TARGETS.find((t) => t === i.then);
      return when && then ? [{ id: str(i.id), text: str(i.text), when, mode: str(i.mode) || "any", then, enabled: i.enabled !== false }] : [];
    }),
    trapApps: (Array.isArray(raw.trapApps) ? raw.trapApps : []).filter(isAppId).slice(0, 3),
    reviewEveryMinutes: count(raw.reviewEveryMinutes) || 60,
    patterns: {
      switchTargets: (Array.isArray(p.switchTargets) ? p.switchTargets : []).filter(isRecord).slice(0, 8).flatMap((s) => (isAppId(s.app) ? [{ mode: str(s.mode), app: s.app, count: count(s.count) }] : [])),
      intentionResponses: (Array.isArray(p.intentionResponses) ? p.intentionResponses : []).filter(isRecord).slice(0, 12).map((r) => ({ intentionId: str(r.intentionId), accepted: count(r.accepted), dismissed: count(r.dismissed), skipped: count(r.skipped) })),
      meanTimeToCloseMinutes: typeof p.meanTimeToCloseMinutes === "number" ? Math.round(p.meanTimeToCloseMinutes) : null,
    },
  };
}

/** The structured-output schema System Two fills. Every field is required; "" / [] mean "not applicable". */
export const PROPOSAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["proposals"],
  properties: {
    proposals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "rationale", "modeLabel", "modeApps", "intentionId", "intentionText", "when", "mode", "then"],
        properties: {
          kind: { type: "string", enum: ["new-mode", "new-intention", "edit-intention"] },
          title: { type: "string" },
          rationale: { type: "string" },
          modeLabel: { type: "string" },
          modeApps: { type: "array", items: { type: "string", enum: APP_IDS } },
          intentionId: { type: "string" },
          intentionText: { type: "string" },
          when: { type: "string", enum: ["", ...WHENS] },
          mode: { type: "string" },
          then: { type: "string", enum: ["", ...TARGETS] },
        },
      },
    },
  },
} as const;

export type SystemTwoProposal =
  | { id: string; kind: "new-mode"; title: string; rationale: string; label: string; apps: AppId[] }
  | { id: string; kind: "new-intention"; title: string; rationale: string; intention: Omit<ImplementationIntention, "id" | "enabled"> }
  | { id: string; kind: "edit-intention"; title: string; rationale: string; intentionId: string; text: string };

/** Turn System Two's JSON into proposals, dropping anything that doesn't trace to the user's model. */
export function parseProposals(raw: unknown, payload: ProposalPayload): SystemTwoProposal[] {
  if (!isRecord(raw) || !Array.isArray(raw.proposals)) return [];
  const modeIds = new Set(payload.modes.map((m) => m.id));
  const intentionIds = new Set(payload.intentions.map((i) => i.id));
  return raw.proposals.filter(isRecord).slice(0, MAX_PROPOSALS).flatMap((p, i): SystemTwoProposal[] => {
    const base = { id: `s2-${i}-${str(p.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`, title: str(p.title), rationale: str(p.rationale) };
    if (!base.title || !base.rationale) return [];
    if (p.kind === "new-mode") {
      const apps = (Array.isArray(p.modeApps) ? p.modeApps : []).filter(isAppId);
      return str(p.modeLabel) && apps.length > 0 ? [{ ...base, kind: "new-mode", label: str(p.modeLabel), apps }] : [];
    }
    if (p.kind === "edit-intention") {
      return intentionIds.has(str(p.intentionId)) && str(p.intentionText) ? [{ ...base, kind: "edit-intention", intentionId: str(p.intentionId), text: str(p.intentionText) }] : [];
    }
    if (p.kind === "new-intention") {
      const when = WHENS.find((w) => w === p.when);
      const then = TARGETS.find((t) => t === p.then);
      const mode = str(p.mode) || "any";
      if (!when || !then || !str(p.intentionText) || (mode !== "any" && !modeIds.has(mode))) return [];
      return [{ ...base, kind: "new-intention", intention: { text: str(p.intentionText), when, mode, then } }];
    }
    return [];
  });
}

const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mode";

/** Apply a confirmed proposal. Returns null if it would leave the model invalid. */
export function applyProposal(model: UserModel, proposal: SystemTwoProposal, newId: string): UserModel | null {
  let next: UserModel;
  if (proposal.kind === "new-mode") {
    let id = slug(proposal.label);
    while (model.modes.some((m) => m.id === id)) id = `${id}-2`;
    next = {
      ...model,
      modes: [...model.modes, {
        id,
        label: proposal.label,
        allowedApps: proposal.apps.filter((a) => model.designatedApps.includes(a)),
        interruptibleBy: ["agent-needs-input"],
        ambiguous: ["agent-finished"],
        isProtected: true,
        description: proposal.rationale,
      }],
    };
  } else if (proposal.kind === "new-intention") {
    next = { ...model, intentions: [...model.intentions, { ...proposal.intention, id: newId, enabled: true }] };
  } else {
    next = { ...model, intentions: model.intentions.map((i) => (i.id === proposal.intentionId ? { ...i, text: proposal.text } : i)) };
  }
  return validateModel(next).length === 0 ? next : null;
}
