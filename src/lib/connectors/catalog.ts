import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { registerApps } from "../focus/apps";
import { manifestApps, validateManifest, type ConnectorManifest } from "./manifest";

/**
 * Server-only: builds the marketplace catalog from connector manifests on
 * disk. Connectors that ship with FocusDeck live in `sensors/<dir>/`; more can
 * be added by pointing FOCUSDECK_CONNECTORS_DIR at folders laid out the same
 * way (community or your own). Nothing is downloaded and nothing is run —
 * the catalog only reads manifests.
 */
export type ConnectorOrigin = "built-in" | "local";

export interface CatalogEntry {
  manifest: ConnectorManifest;
  origin: ConnectorOrigin;
  /** Published by FocusDeck and shipped in this repository. */
  verified: boolean;
  /** Absolute path of the connector's folder. */
  dir: string;
}

export interface ConnectorCatalog {
  entries: CatalogEntry[];
  errors: { path: string; problems: string[] }[];
  repoDir: string;
}

const CACHE_MS = 5_000;
let cached: { at: number; catalog: Promise<ConnectorCatalog> } | null = null;

export function repoDir(): string {
  return process.env.FOCUSDECK_DIR || process.cwd();
}

async function manifestPaths(root: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const name of names.sort()) {
    const file = path.join(root, name, "manifest.json");
    try {
      if ((await stat(file)).isFile()) found.push(file);
    } catch {
      // Not a connector folder.
    }
  }
  return found;
}

async function build(): Promise<ConnectorCatalog> {
  const repo = repoDir();
  const roots: { root: string; origin: ConnectorOrigin }[] = [
    { root: path.join(repo, "sensors"), origin: "built-in" },
    ...(process.env.FOCUSDECK_CONNECTORS_DIR ?? "").split(path.delimiter).filter(Boolean).map((root) => ({ root: path.resolve(root), origin: "local" as const })),
  ];
  const catalog: ConnectorCatalog = { entries: [], errors: [], repoDir: repo };
  for (const { root, origin } of roots) {
    for (const file of await manifestPaths(root)) {
      const shown = path.relative(repo, file) || file;
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(file, "utf8"));
      } catch {
        catalog.errors.push({ path: shown, problems: ["Not valid JSON."] });
        continue;
      }
      const result = validateManifest(raw);
      if (!result.ok) {
        catalog.errors.push({ path: shown, problems: result.problems });
        continue;
      }
      if (catalog.entries.some((e) => e.manifest.id === result.manifest.id)) {
        catalog.errors.push({ path: shown, problems: [`Another connector already uses the id "${result.manifest.id}".`] });
        continue;
      }
      const verified = origin === "built-in" && result.manifest.publisher === "FocusDeck";
      catalog.entries.push({ manifest: result.manifest, origin, verified, dir: path.dirname(file) });
      registerApps(manifestApps(result.manifest));
    }
  }
  return catalog;
}

/** The catalog, re-read at most every few seconds so edits to a manifest show up quickly. */
export function loadConnectorCatalog(now = Date.now()): Promise<ConnectorCatalog> {
  if (!cached || now - cached.at > CACHE_MS) cached = { at: now, catalog: build() };
  return cached.catalog;
}
