import type { SynthesisPayload } from "../systemTwo/payload";
import type { ProviderId } from "../systemTwo/providerCatalog";
import type { ProposalPayload, SystemTwoProposal } from "../systemTwo/proposals";
import { authHeaders } from "./persist";
import { store } from "./store";

/**
 * The page's side of System Two. Only ever called after you opt in, and only
 * with the sanitized payloads — the server re-validates them anyway. Every
 * request names the provider you chose; your keys and logins never pass
 * through the page.
 */
export interface ProviderStatus {
  id: ProviderId;
  ready: boolean;
  detail: string;
  model: string | null;
}

export interface SystemTwoStatus {
  providers: ProviderStatus[];
}

export async function fetchSystemTwoStatus(): Promise<SystemTwoStatus | null> {
  try {
    const res = await fetch("/api/system-two", { cache: "no-store", headers: authHeaders() });
    return res.ok ? ((await res.json()) as SystemTwoStatus) : null;
  } catch {
    return null;
  }
}

async function post<T>(task: "synthesis" | "proposals" | "test", payload: unknown, provider: ProviderId = store.getSnapshot().model.systemTwoProvider): Promise<T | null> {
  try {
    const res = await fetch("/api/system-two", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ task, payload, provider }),
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
  provider?: ProviderId;
  note?: string;
}

export const requestSynthesis = (payload: SynthesisPayload) => post<SynthesisResult>("synthesis", payload);

export interface ProposalsResult {
  proposals: SystemTwoProposal[];
  source: "system-two" | "unavailable";
  model?: string;
  provider?: ProviderId;
  note?: string;
}

export const requestProposals = (payload: ProposalPayload) => post<ProposalsResult>("proposals", payload);

export interface ProviderTestResult {
  ok: boolean;
  text?: string;
  model?: string;
  reason?: string;
  ms: number;
}

/** A real, tiny request through one provider — only when you press Test. */
export const testProvider = (provider: ProviderId) => post<ProviderTestResult>("test", null, provider);

/** A short random id for things you declare. Only called from event handlers. */
export const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
