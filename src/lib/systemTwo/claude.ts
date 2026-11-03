import Anthropic from "@anthropic-ai/sdk";
import type { SynthesisPayload } from "./payload";
import type { ProposalPayload, SystemTwoProposal } from "./proposals";
import { proposeWith, synthesizeWith, type Generate, type GenerateRequest, type SystemTwoOutcome } from "./tasks";

export type { SystemTwoOutcome } from "./tasks";

/**
 * Server-only: System Two on the Anthropic API, through the official SDK.
 * Called on demand from the mirror and Declare screens — never per event.
 * Server-side refusal fallback is on (`fallbacks: "default"`), so a declined
 * request is retried on Anthropic's recommended model; anything that still
 * fails returns a reason and the caller falls back to the template.
 */
export const SYSTEM_TWO_MODEL = process.env.FOCUSDECK_SYSTEM_TWO_MODEL || "claude-opus-5-5";
const TIMEOUT_MS = 60_000;

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
  if (error instanceof Error && /credential|api key|apiKey|authToken/i.test(error.message)) return "No Anthropic credentials found. Set ANTHROPIC_API_KEY, or run `ant auth login`.";
  return "System Two failed unexpectedly.";
}

/** The Anthropic API as a System Two provider. */
export function anthropicGenerator(client: SystemTwoClient | null = null): Generate {
  return async ({ system, prompt, schema, effort }: GenerateRequest) => {
    try {
      const response = await (client ?? defaultClient()).beta.messages.create(
        {
          model: SYSTEM_TWO_MODEL,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort, ...(schema ? { format: { type: "json_schema" as const, schema } } : {}) },
          system,
          messages: [{ role: "user", content: prompt }],
        },
        { timeout: TIMEOUT_MS },
      );
      if (response.stop_reason === "refusal") return { ok: false, reason: "System Two declined this request, so the template is shown instead." };
      if (response.stop_reason === "max_tokens") return { ok: false, reason: "System Two ran out of room before finishing." };
      const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("").trim();
      return text ? { ok: true, text, model: response.model } : { ok: false, reason: "System Two returned nothing." };
    } catch (error) {
      return { ok: false, reason: describeError(error) };
    }
  };
}

export async function synthesizeWeek(payload: SynthesisPayload, client: SystemTwoClient | null = null): Promise<SystemTwoOutcome<string>> {
  return synthesizeWith(anthropicGenerator(client), payload);
}

export async function draftProposals(payload: ProposalPayload, client: SystemTwoClient | null = null): Promise<SystemTwoOutcome<SystemTwoProposal[]>> {
  return proposeWith(anthropicGenerator(client), payload);
}
