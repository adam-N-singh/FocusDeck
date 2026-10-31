import { checkTrust, requestFacts, trustConfigFromEnv } from "@/lib/bridge/trust";
import { SYSTEM_TWO_MODEL, credentialsHint, draftProposals, synthesizeWeek } from "@/lib/systemTwo/claude";
import { sanitizeSynthesisPayload, templateSynthesis } from "@/lib/systemTwo/payload";
import { sanitizeProposalPayload } from "@/lib/systemTwo/proposals";

/**
 * System Two (Layer 3): slow, generative work off the hot path. Only the
 * FocusDeck page itself may call it, only with the sanitized payloads, and
 * the user must have opted in (the page never calls it otherwise). Every
 * failure degrades to the deterministic template — never to an error screen.
 */
export async function GET(request: Request) {
  const trust = checkTrust(requestFacts(request), trustConfigFromEnv(), "read");
  if (!trust.ok) return Response.json({ error: trust.reason }, { status: trust.status });
  return Response.json({ model: SYSTEM_TWO_MODEL, credentialsHint: credentialsHint() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const trust = checkTrust(requestFacts(request), trustConfigFromEnv(), "write-config");
  if (!trust.ok) return Response.json({ error: trust.reason }, { status: trust.status });
  let body: { task?: unknown; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  if (body.task === "synthesis") {
    const payload = sanitizeSynthesisPayload(body.payload);
    if (!payload) return Response.json({ error: "Invalid synthesis payload." }, { status: 400 });
    const result = await synthesizeWeek(payload);
    return Response.json(result.ok
      ? { text: result.value, source: "system-two", model: result.model }
      : { text: templateSynthesis(payload), source: "template", note: result.reason });
  }

  if (body.task === "proposals") {
    const payload = sanitizeProposalPayload(body.payload);
    if (!payload) return Response.json({ error: "Invalid proposal payload." }, { status: 400 });
    const result = await draftProposals(payload);
    return Response.json(result.ok
      ? { proposals: result.value, source: "system-two", model: result.model }
      : { proposals: [], source: "unavailable", note: result.reason });
  }

  return Response.json({ error: 'task must be "synthesis" or "proposals".' }, { status: 400 });
}
