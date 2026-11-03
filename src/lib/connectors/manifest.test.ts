import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appLabel } from "../focus/apps";
import { loadConnectorCatalog } from "./catalog";
import { connectorAppIds, personalize, validateManifest } from "./manifest";

const SENSORS = path.join(process.cwd(), "sensors");

const minimal = () => ({
  id: "example",
  name: "Example",
  publisher: "Someone",
  version: "0.1.0",
  category: "generic",
  summary: "Tells FocusDeck when something happens.",
  description: "A longer description.",
  status: "spike",
  platforms: ["linux"],
  emits: [{ kind: "notification", app: "example-app", when: "Something happens" }],
  apps: [{ id: "example-app", label: "Example app", group: "tasks" }],
  privacy: { sends: ["kind", "app", "via"], neverSends: ["Anything you wrote"] },
  setup: [{ title: "Install it", code: { language: "bash", content: "node {{FOCUSDECK_DIR}}/x.mjs" } }],
});

describe("connector manifests", () => {
  it("every manifest shipped in sensors/ is valid", async () => {
    const dirs = (await readdir(SENSORS, { withFileTypes: true })).filter((d) => d.isDirectory());
    let checked = 0;
    for (const dir of dirs) {
      let raw: string;
      try {
        raw = await readFile(path.join(SENSORS, dir.name, "manifest.json"), "utf8");
      } catch {
        continue;
      }
      const result = validateManifest(JSON.parse(raw));
      expect(result.ok ? [] : result.problems, `sensors/${dir.name}/manifest.json`).toEqual([]);
      checked += 1;
    }
    expect(checked).toBeGreaterThanOrEqual(2);
  });

  it("can only promise fields the bridge accepts — a manifest claiming more is invalid", () => {
    const result = validateManifest({ ...minimal(), privacy: { sends: ["kind", "app", "title"], neverSends: ["x"] } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(" ")).toContain("title");
  });

  it("requires emitted apps to be built in or introduced by the manifest, and keeps built-ins built in", () => {
    expect(validateManifest({ ...minimal(), apps: [] }).ok).toBe(false);
    expect(validateManifest({ ...minimal(), apps: [{ id: "editor", label: "My editor", group: "work" }] }).ok).toBe(false);
    const ok = validateManifest(minimal());
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(connectorAppIds(ok.manifest)).toEqual(["example-app"]);
  });

  it("rejects ids, docs paths and statuses that don't fit", () => {
    expect(validateManifest({ ...minimal(), id: "Bad Id" }).ok).toBe(false);
    expect(validateManifest({ ...minimal(), docs: "../../etc/passwd" }).ok).toBe(false);
    expect(validateManifest({ ...minimal(), docs: "/etc/passwd" }).ok).toBe(false);
    expect(validateManifest({ ...minimal(), status: "beta" }).ok).toBe(false);
    expect(validateManifest({ ...minimal(), emits: [], status: "planned" }).ok).toBe(true);
  });

  it("fills placeholders, escaping them inside JSON", () => {
    const values = { dir: "C:\\Users\\me\\FocusDeck", url: "http://localhost:3000", connectorDir: "/c" };
    expect(personalize("node {{FOCUSDECK_DIR}}/x.mjs", values)).toBe("node C:\\Users\\me\\FocusDeck/x.mjs");
    const json = personalize('{"command":"node {{FOCUSDECK_DIR}}/x.mjs","url":"{{FOCUSDECK_URL}}"}', values, { json: true });
    expect(JSON.parse(json)).toEqual({ command: "node C:\\Users\\me\\FocusDeck/x.mjs", url: "http://localhost:3000" });
  });
});

describe("connector catalog", () => {
  let extra: string | null = null;
  afterEach(async () => {
    delete process.env.FOCUSDECK_CONNECTORS_DIR;
    if (extra) await rm(extra, { recursive: true, force: true });
    extra = null;
  });

  it("loads built-in connectors as verified, community ones as local, and reports broken manifests", async () => {
    extra = await mkdtemp(path.join(tmpdir(), "focusdeck-connectors-"));
    await mkdir(path.join(extra, "example"));
    await writeFile(path.join(extra, "example", "manifest.json"), JSON.stringify(minimal()));
    await mkdir(path.join(extra, "broken"));
    await writeFile(path.join(extra, "broken", "manifest.json"), "{ not json");
    await mkdir(path.join(extra, "copycat"));
    await writeFile(path.join(extra, "copycat", "manifest.json"), JSON.stringify({ ...minimal(), id: "claude-code" }));
    process.env.FOCUSDECK_CONNECTORS_DIR = extra;

    const catalog = await loadConnectorCatalog(Number.MAX_SAFE_INTEGER);
    const byId = new Map(catalog.entries.map((e) => [e.manifest.id, e]));
    expect(byId.get("claude-code")).toMatchObject({ origin: "built-in", verified: true });
    expect(byId.get("example")).toMatchObject({ origin: "local", verified: false, dir: path.join(extra, "example") });
    expect(catalog.errors.map((e) => e.problems[0])).toEqual(
      expect.arrayContaining(["Not valid JSON.", 'Another connector already uses the id "claude-code".']),
    );
    // The apps a connector introduces join the registry, so labels and sensors know them.
    expect(appLabel("example-app")).toBe("Example app");
  });
});
