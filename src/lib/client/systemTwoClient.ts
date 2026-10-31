import type { SynthesisPayload } from "../systemTwo/payload";
import type { ProposalPayload, SystemTwoProposal } from "../systemTwo/proposals";
import { authHeaders } from "./persist";

/**
 * The page's side of System Two. Only ever called after you opt in, and only
 * with the sanitized payloads — the server re-validates them anyway.
 */
export interface SystemTwoStatus {
  model: string;
  credentialsHint: boolean;
}

export async function fetchSystemTwoStatus(): Promise<SystemTwoStatus | null> {
  try {
    const res = await fetch("/api/system-two", { cache: "no-store", headers: authHeaders() });
    return res.ok ? ((await res.json()) as SystemTwoStatus) : null;
  } catch {
    return null;
  }
}

async function post<T>(task: "synthesis" | "proposals", payload: unknown): Promise<T | null> {
  try {
    const res = await fetch("/api/system-two", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ task, payload }),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export interface SynthesisResult {
  text: string;
  source: "system-two" | "template";
  model?: string;
  note?: string;
}

export const requestSynthesis = (payload: SynthesisPayload) => post<SynthesisResult>("synthesis", payload);

export interface ProposalsResult {
  proposals: SystemTwoProposal[];
  source: "system-two" | "unavailable";
  model?: string;
  note?: string;
}

export const requestProposals = (payload: ProposalPayload) => post<ProposalsResult>("proposals", payload);

/** A short random id for things you declare. Only called from event handlers. */
export const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
