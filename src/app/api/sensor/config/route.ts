import { getConfig, setConfig } from "@/lib/bridge/store";
import { checkTrust, requestFacts, trustConfigFromEnv } from "@/lib/bridge/trust";

/**
 * Which apps are designated. Sensors GET this to filter at the sensor; only
 * the FocusDeck app itself (same-origin browser request) may PUT it.
 */
export async function GET(request: Request) {
  const trust = checkTrust(requestFacts(request), trustConfigFromEnv(), "read");
  if (!trust.ok) return Response.json({ error: trust.reason }, { status: trust.status });
  return Response.json({ ...getConfig(), tokenRequired: Boolean(trustConfigFromEnv().token) }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(request: Request) {
  const trust = checkTrust(requestFacts(request), trustConfigFromEnv(), "write-config");
  if (!trust.ok) return Response.json({ error: trust.reason }, { status: trust.status });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const result = setConfig(body);
  return result.ok ? Response.json(result.config) : Response.json({ error: result.reason }, { status: 400 });
}
