import path from "node:path";
import { getStats } from "@/lib/bridge/store";
import { checkTrust, requestFacts, trustConfigFromEnv } from "@/lib/bridge/trust";
import { loadConnectorCatalog } from "@/lib/connectors/catalog";
import { personalize } from "@/lib/connectors/manifest";

/**
 * The connector marketplace: every manifest FocusDeck found, with setup steps
 * filled in for this machine, plus what each connector has sent since the
 * server started (counts and times only). Read-only, and guarded like the
 * sensor bridge — it reveals local paths and activity timing.
 */
export async function GET(request: Request) {
  const trust = checkTrust(requestFacts(request), trustConfigFromEnv(), "read");
  if (!trust.ok) return Response.json({ error: trust.reason }, { status: trust.status });

  const catalog = await loadConnectorCatalog();
  const url = `http://${request.headers.get("host") ?? "127.0.0.1:3000"}`;
  const connectors = catalog.entries.map(({ manifest, origin, verified, dir }) => {
    const values = { dir: catalog.repoDir, url, connectorDir: dir };
    return {
      ...manifest,
      setup: manifest.setup.map((step) =>
        step.code ? { ...step, code: { ...step.code, content: personalize(step.code.content, values, { json: step.code.language === "json" }) } } : step),
      test: manifest.test ? { ...manifest.test, command: personalize(manifest.test.command, values) } : undefined,
      docs: manifest.docs ? path.join(origin === "built-in" ? catalog.repoDir : dir, manifest.docs) : undefined,
      origin,
      verified,
    };
  });
  return Response.json(
    { connectors, errors: catalog.errors, repoDir: catalog.repoDir, url, stats: getStats().byConnector },
    { headers: { "Cache-Control": "no-store" } },
  );
}
