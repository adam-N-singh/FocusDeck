import Anthropic from "@anthropic-ai/sdk";
import { parseProposals, PROPOSAL_SCHEMA, type ProposalPayload, type SystemTwoProposal } from "./proposals";
import type { SynthesisPayload } from "./payload";

/**
 * Server-only System Two client (Claude). Called on demand from the mirror
 * and Declare screens — never per event. Requests carry only the sanitized
 * payloads from payload.ts / proposals.ts. Server-side refusal fallback is on
 * by default (`fallbacks: "default"`), so a declined request is retried on
 * Anthropic's recommended model; anything that still fails returns a reason
 * and the caller falls back to the deterministic template.
 */
export const SYSTEM_TWO_MODEL = process.env.FOCUSDECK_SYSTEM_TWO_MODEL || "claude-opus-5-5";
const TIMEOUT_MS = 60_000;

const SYNTHESIS_SYSTEM = `You write the weekly mirror for FocusDeck, a private attention companion for people who supervise AI agents while doing their own focused work. You receive this week's aggregates as JSON. Write one paragraph of 50 to 90 words, addressed to the person as "you".

Voice: adult and quiet. No exclamation marks, no streaks, no praise inflation, no guilt, no urgency. Dismissing an offer is always fine; never treat it as a failure.
Facts: use only the numbers in the JSON and never invent any. Name the trend with the provided state word when there is one. If a week was forgiven, don't dwell on it. If "demo" is true, say in a few words that this is demo data.
Shape: at most one supportive observation and at most one thing to try next week, offered as an option rather than an instruction. Plain prose only: no headings, lists, or markdown.`;

const PROPOSALS_SYSTEM = `You draft proposals for a person's FocusDeck model. FocusDeck notices when they drift toward a trap app or are interrupted by their agents, and offers what they themselves declared they want. You receive their declared modes and intentions (their own words) and aggregate patterns as JSON.

Propose at most 3 changes that would make their declared model fit how they actually work. Every proposal must trace to a specific pattern in the data; if nothing in the data supports a change, return an empty list. The person confirms or rejects each one, and nothing takes effect on its own.

Kinds:
- new-mode: a mode for a recurring context. Fill modeLabel and modeApps; leave the intention fields empty.
- new-intention: an implementation intention in the first person ("When I ..., ..."), with when, mode (an existing mode id, or "any") and then. Leave the mode fields empty.
- edit-intention: a clearer or better-scoped rewording of an existing intention (intentionId and intentionText), keeping the person's own voice.

Never suggest blocking or restricting anything: FocusDeck replaces, it never restricts. Use "batch" only with agent-blocks, agent-finishes or notification. Keep each title under 60 characters and each rationale to one sentence that cites the numbers.`;

export type SystemTwoOutcome<T> = { ok: true; value: T; model: string } | { ok: false; reason: string };

/** The slice of the SDK this module uses — injectable so tests never touch the network. */
export interface SystemTwoClient {
  beta: { messages: { create: Anthropic["beta"]["messages"]["create"] } };
}

let shared: SystemTwoClient | null = null;
const defaultClient = (): SystemTwoClient => (shared ??= new Anthropic());

/** A hint for the UI only; the SDK can also find credentials from an `ant auth login` profile. */
export const credentialsHint = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "No valid Anthropic credentials. Set ANTHROPIC_API_KEY, or run `ant auth login`.";
  if (error instanceof Anthropic.PermissionDeniedError) return "These Anthropic credentials can't use this model.";
  if (error instanceof Anthropic.RateLimitError) return "Rate limited by the Anthropic API. Try again in a minute.";
  if (error instanceof Anthropic.APIConnectionError) return "Couldn't reach the Anthropic API.";
  if (error instanceof Anthropic.APIError) return `The Anthropic API returned an error (${error.status ?? "unknown"}).`;
  if (error instanceof Error && /credential|api key|apiKey/i.test(error.message)) return "No Anthropic credentials found. Set ANTHROPIC_API_KEY, or run `ant auth login`.";
  return "System Two failed unexpectedly.";
}

async function ask(
  client: SystemTwoClient | null,
  system: string,
  payload: unknown,
  effort: "low" | "medium",
  schema?: Record<string, unknown>,
): Promise<SystemTwoOutcome<string>> {
  try {
    const response = await (client ?? defaultClient()).beta.messages.create(
      {
        model: SYSTEM_TWO_MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort, ...(schema ? { format: { type: "json_schema" as const, schema } } : {}) },
        system,
        messages: [{ role: "user", content: `Here is the data, as JSON:\n${JSON.stringify(payload)}` }],
      },
      { timeout: TIMEOUT_MS },
    );
    if (response.stop_reason === "refusal") return { ok: false, reason: "System Two declined this request, so the template is shown instead." };
    if (response.stop_reason === "max_tokens") return { ok: false, reason: "System Two ran out of room before finishing." };
    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("").trim();
    return text ? { ok: true, value: text, model: response.model } : { ok: false, reason: "System Two returned nothing." };
  } catch (error) {
    return { ok: false, reason: describeError(error) };
  }
}

export async function synthesizeWeek(payload: SynthesisPayload, client: SystemTwoClient | null = null): Promise<SystemTwoOutcome<string>> {
  return ask(client, SYNTHESIS_SYSTEM, payload, "low");
}

export async function draftProposals(payload: ProposalPayload, client: SystemTwoClient | null = null): Promise<SystemTwoOutcome<SystemTwoProposal[]>> {
  const result = await ask(client, PROPOSALS_SYSTEM, payload, "medium", PROPOSAL_SCHEMA as unknown as Record<string, unknown>);
  if (!result.ok) return result;
  try {
    return { ok: true, value: parseProposals(JSON.parse(result.value), payload), model: result.model };
  } catch {
    return { ok: false, reason: "System Two's answer wasn't valid JSON." };
  }
}
