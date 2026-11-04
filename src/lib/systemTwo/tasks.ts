import { APP_IDS } from "../focus/apps";
import type { SynthesisPayload } from "./payload";
import { parseProposals, PROPOSAL_SCHEMA, type ProposalPayload, type SystemTwoProposal } from "./proposals";

/**
 * System Two's two jobs, independent of which AI does them. A provider is
 * just a `Generate` function (adapters: claude.ts, openaiCompatible.ts,
 * cli.ts); the prompts, the data boundary and the parsing live here, so every
 * provider sees exactly the same sanitized payload and is held to the same
 * output checks.
 */
export interface GenerateRequest {
  system: string;
  prompt: string;
  /** A JSON Schema the answer must match, when the task wants structured output. */
  schema?: Record<string, unknown>;
  effort: "low" | "medium";
}

export type GenerateOutcome = { ok: true; text: string; model: string } | { ok: false; reason: string };
export type Generate = (request: GenerateRequest) => Promise<GenerateOutcome>;
export type SystemTwoOutcome<T> = { ok: true; value: T; model: string } | { ok: false; reason: string };

export const SYNTHESIS_SYSTEM = `You write the weekly mirror for FocusDeck, a private attention companion for people who supervise AI agents while doing their own focused work. You receive this week's aggregates as JSON. Write one paragraph of 50 to 90 words, addressed to the person as "you".

Voice: adult and quiet. No exclamation marks, no streaks, no praise inflation, no guilt, no urgency. Dismissing an offer is always fine; never treat it as a failure.
Facts: use only the numbers in the JSON and never invent any. Name the trend with the provided state word when there is one. If a week was forgiven, don't dwell on it. If "demo" is true, say in a few words that this is demo data.
Shape: at most one supportive observation and at most one thing to try next week, offered as an option rather than an instruction. Plain prose only: no headings, lists, or markdown.`;

export const PROPOSALS_SYSTEM = `You draft proposals for a person's FocusDeck model. FocusDeck notices when they drift toward a trap app or are interrupted by their agents, and offers what they themselves declared they want. You receive their declared modes and intentions (their own words) and aggregate patterns as JSON.

Propose at most 3 changes that would make their declared model fit how they actually work. Every proposal must trace to a specific pattern in the data; if nothing in the data supports a change, return an empty list. The person confirms or rejects each one, and nothing takes effect on its own.

Kinds:
- new-mode: a mode for a recurring context. Fill modeLabel and modeApps; leave the intention fields empty.
- new-intention: an implementation intention in the first person ("When I ..., ..."), with when, mode (an existing mode id, or "any") and then. Leave the mode fields empty.
- edit-intention: a clearer or better-scoped rewording of an existing intention (intentionId and intentionText), keeping the person's own voice.

Never suggest blocking or restricting anything: FocusDeck replaces, it never restricts. Use "batch" only with agent-blocks, agent-finishes or notification. Keep each title under 60 characters and each rationale to one sentence that cites the numbers.`;

export const dataPrompt = (payload: unknown) => `Here is the data, as JSON:\n${JSON.stringify(payload)}`;

/** The proposal schema, with modeApps limited to the apps the payload actually mentions. */
export function proposalSchema(payload: ProposalPayload): Record<string, unknown> {
  const apps = [...new Set([...APP_IDS, ...payload.modes.flatMap((m) => m.apps), ...payload.trapApps, ...payload.patterns.switchTargets.map((s) => s.app)])];
  const schema = structuredClone(PROPOSAL_SCHEMA) as unknown as { properties: { proposals: { items: { properties: { modeApps: { items: { enum: string[] } } } } } } };
  schema.properties.proposals.items.properties.modeApps.items.enum = apps;
  return schema as unknown as Record<string, unknown>;
}

/**
 * Pull the JSON object out of a reply. Providers without enforced structured
 * output sometimes wrap it in a code fence or a sentence; anything that
 * still isn't an object fails, and parseProposals checks the rest.
 */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object");
  return JSON.parse(body.slice(start, end + 1));
}

export async function synthesizeWith(generate: Generate, payload: SynthesisPayload): Promise<SystemTwoOutcome<string>> {
  const result = await generate({ system: SYNTHESIS_SYSTEM, prompt: dataPrompt(payload), effort: "low" });
  return result.ok ? { ok: true, value: result.text.trim(), model: result.model } : result;
}

export async function proposeWith(generate: Generate, payload: ProposalPayload): Promise<SystemTwoOutcome<SystemTwoProposal[]>> {
  const result = await generate({ system: PROPOSALS_SYSTEM, prompt: dataPrompt(payload), schema: proposalSchema(payload), effort: "medium" });
  if (!result.ok) return result;
  try {
    return { ok: true, value: parseProposals(extractJson(result.text), payload), model: result.model };
  } catch {
    return { ok: false, reason: "System Two's answer wasn't valid JSON." };
  }
}

/** A connection check that costs a few tokens: the person presses Test, nothing runs on its own. */
export async function checkWith(generate: Generate): Promise<SystemTwoOutcome<string>> {
  const result = await generate({ system: "You are a connection check. Reply with exactly the word: ready", prompt: "Are you there?", effort: "low" });
  return result.ok ? { ok: true, value: result.text.trim().slice(0, 80), model: result.model } : result;
}
