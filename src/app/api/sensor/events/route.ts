import { ingest, readSince } from "@/lib/bridge/store";
import { checkTrust, requestFacts, trustConfigFromEnv } from "@/lib/bridge/trust";

/**
 * Sensor bridge: sensors POST metadata-only events; the FocusDeck app polls
 * them with GET ?after=<seq>. Both read request data, so neither is ever
 * prerendered at build time (Cache Components).
 */
export async function POST(request: Request) {
  const trust = checkTrust(requestFacts(request), trustConfigFromEnv(), "write");
  if (!trust.ok) return Response.json({ error: trust.reason }, { status: trust.status });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const result = ingest(body);
  const status = result.accepted === 0 && result.dropped === 0 && result.rejected.length > 0 ? 422 : 200;
  return Response.json(result, { status });
}

export async function GET(request: Request) {
  const trust = checkTrust(requestFacts(request), trustConfigFromEnv(), "read");
  if (!trust.ok) return Response.json({ error: trust.reason }, { status: trust.status });
  const after = Number(new URL(request.url).searchParams.get("after") ?? "0");
  return Response.json(readSince(Number.isFinite(after) && after > 0 ? after : 0), {
    headers: { "Cache-Control": "no-store" },
  });
}
