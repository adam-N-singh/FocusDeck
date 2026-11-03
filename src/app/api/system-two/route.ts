import { checkTrust, requestFacts, trustConfigFromEnv } from "@/lib/bridge/trust";
import { sanitizeSynthesisPayload, templateSynthesis } from "@/lib/systemTwo/payload";
import { DEFAULT_PROVIDER, PROVIDER_IDS, isProviderId } from "@/lib/systemTwo/providerCatalog";
import { generatorFor, providerStatus } from "@/lib/systemTwo/providers";
import { sanitizeProposalPayload } from "@/lib/systemTwo/proposals";
import { checkWith, proposeWith, synthesizeWith } from "@/lib/systemTwo/tasks";

/**
 * System Two (Layer 3): slow, generative work off the hot path, on the AI the
 * person chose — an API key, a local model, or their own subscription's CLI.
 * Only the FocusDeck page itself may call it, only with the sanitized
 * payloads, and only after opting in. Every failure degrades to the
 * deterministic template — never to an error screen.
 */
export async function GET(request: Request) {
  const trust = checkTrust(requestFacts(request), trustConfigFromEnv(), "read");
  if (!trust.ok) return Response.json({ error: trust.reason }, { status: trust.status });
  const providers = await Promise.all(PROVIDER_IDS.map((id) => providerStatus(id)));
  return Response.json({ providers }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const trust = checkTrust(requestFacts(request), trustConfigFromEnv(), "write-config");
  if (!trust.ok) return Response.json({ error: trust.reason }, { status: trust.status });
  let body: { task?: unknown; payload?: unknown; provider?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const provider = body.provider === undefined ? DEFAULT_PROVIDER : body.provider;
  if (!isProviderId(provider)) return Response.json({ error: `provider must be one of: ${PROVIDER_IDS.join(", ")}.` }, { status: 400 });

  if (body.task === "test") {
    const started = Date.now();
    const generate = await generatorFor(provider);
    if ("error" in generate) return Response.json({ ok: false, reason: generate.error, ms: 0 });
    const result = await checkWith(generate);
    const ms = Date.now() - started;
    return Response.json(result.ok ? { ok: true, text: result.value, model: result.model, ms } : { ok: false, reason: result.reason, ms });
  }

  if (body.task === "synthesis") {
    const payload = sanitizeSynthesisPayload(body.payload);
    if (!payload) return Response.json({ error: "Invalid synthesis payload." }, { status: 400 });
    const generate = await generatorFor(provider);
    const result = "error" in generate ? { ok: false as const, reason: generate.error } : await synthesizeWith(generate, payload);
    return Response.json(result.ok
      ? { text: result.value, source: "system-two", model: result.model, provider }
      : { text: templateSynthesis(payload), source: "template", note: result.reason, provider });
  }

  if (body.task === "proposals") {
    const payload = sanitizeProposalPayload(body.payload);
    if (!payload) return Response.json({ error: "Invalid proposal payload." }, { status: 400 });
    const generate = await generatorFor(provider);
    const result = "error" in generate ? { ok: false as const, reason: generate.error } : await proposeWith(generate, payload);
    return Response.json(result.ok
      ? { proposals: result.value, source: "system-two", model: result.model, provider }
      : { proposals: [], source: "unavailable", note: result.reason, provider });
  }

  return Response.json({ error: 'task must be "synthesis", "proposals" or "test".' }, { status: 400 });
}
