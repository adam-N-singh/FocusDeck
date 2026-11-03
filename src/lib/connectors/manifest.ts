import { APP_CATALOG, APP_ID_PATTERN, type AppGroup, type AppInfo } from "../focus/apps";
import { ALLOWED_FIELDS, SENSOR_KINDS, type SensorKind } from "../bridge/intake";

/**
 * The connector manifest: one JSON file per connector (`sensors/<dir>/manifest.json`)
 * that drives the in-app marketplace. A manifest only *describes* a connector —
 * FocusDeck never runs anything from it. Setup commands are shown for you to
 * read and copy, and the privacy section can only ever promise fields the
 * bridge accepts: a manifest claiming to send anything else is invalid.
 */
export const CONNECTOR_CATEGORIES = ["agents", "editor", "comms", "browser", "os", "tasks", "generic"] as const;
export type ConnectorCategory = (typeof CONNECTOR_CATEGORIES)[number];
export const CONNECTOR_STATUSES = ["ready", "spike", "planned"] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];
export const PLATFORMS = ["macos", "linux", "windows"] as const;
export type Platform = (typeof PLATFORMS)[number];
const GROUPS: AppGroup[] = ["work", "agents", "comms", "browser", "tasks"];
const LANGUAGES = ["bash", "sh", "powershell", "json", "toml", "yaml", "js", "text"];

export const isConnectorId = (v: unknown): v is string => typeof v === "string" && APP_ID_PATTERN.test(v);

export interface ConnectorManifest {
  id: string;
  name: string;
  publisher: string;
  version: string;
  category: ConnectorCategory;
  summary: string;
  description: string;
  status: ConnectorStatus;
  platforms: Platform[];
  emits: { kind: SensorKind; app: string; when: string }[];
  /** Apps this connector introduces (built-in apps are listed in `emits` only). */
  apps: { id: string; label: string; group: AppGroup; bundleIds?: string[] }[];
  privacy: { sends: string[]; neverSends: string[] };
  requirements: string[];
  setup: { title: string; body?: string; code?: { language: string; content: string } }[];
  test?: { command: string; expect: string };
  docs?: string;
}

export type ManifestResult = { ok: true; manifest: ConnectorManifest } | { ok: false; problems: string[] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Validate untrusted JSON into a manifest; every problem is reported in plain words. */
export function validateManifest(raw: unknown): ManifestResult {
  const problems: string[] = [];
  if (!isObject(raw)) return { ok: false, problems: ["A manifest must be a JSON object."] };
  const text = (key: string, max: number, required = true): string => {
    const v = raw[key];
    if (v === undefined && !required) return "";
    if (typeof v !== "string" || !v.trim()) problems.push(`"${key}" must be a non-empty string.`);
    else if (v.length > max) problems.push(`"${key}" must be at most ${max} characters.`);
    return typeof v === "string" ? v.trim() : "";
  };
  const strings = (v: unknown, where: string, maxItems: number, maxLength: number): string[] => {
    if (!Array.isArray(v) || v.some((s) => typeof s !== "string" || !s.trim() || s.length > maxLength) || v.length > maxItems) {
      problems.push(`"${where}" must be a list of at most ${maxItems} short strings.`);
      return [];
    }
    return v as string[];
  };
  const oneOf = <T extends string>(key: string, options: readonly T[]): T => {
    const v = raw[key];
    if (typeof v !== "string" || !(options as readonly string[]).includes(v)) problems.push(`"${key}" must be one of: ${options.join(", ")}.`);
    return v as T;
  };

  const id = raw.id;
  if (!isConnectorId(id)) problems.push('"id" must be lowercase letters, digits and dashes (up to 40), starting with a letter or digit.');
  const name = text("name", 60);
  const publisher = text("publisher", 60);
  const version = text("version", 20);
  if (version && !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) problems.push('"version" must look like 1.2.3.');
  const category = oneOf("category", CONNECTOR_CATEGORIES);
  const summary = text("summary", 160);
  const description = text("description", 1200);
  const status = oneOf("status", CONNECTOR_STATUSES);
  const platforms = strings(raw.platforms, "platforms", 3, 10);
  if (platforms.length === 0 || platforms.some((p) => !(PLATFORMS as readonly string[]).includes(p))) {
    problems.push(`"platforms" must list one or more of: ${PLATFORMS.join(", ")}.`);
  }

  const apps: ConnectorManifest["apps"] = [];
  if (raw.apps !== undefined && !Array.isArray(raw.apps)) problems.push('"apps" must be a list.');
  for (const app of Array.isArray(raw.apps) ? raw.apps : []) {
    if (!isObject(app) || !isConnectorId(app.id) || typeof app.label !== "string" || !app.label.trim() || app.label.length > 60 || !GROUPS.includes(app.group as AppGroup)) {
      problems.push(`Each entry in "apps" needs an id, a short label and a group (${GROUPS.join(", ")}).`);
      continue;
    }
    if (APP_CATALOG.some((b) => b.id === app.id)) {
      problems.push(`"${app.id}" is built in — list it under "emits" only.`);
      continue;
    }
    const bundleIds = app.bundleIds === undefined ? undefined : strings(app.bundleIds, `apps.${app.id}.bundleIds`, 20, 120);
    apps.push({ id: app.id, label: app.label.trim(), group: app.group as AppGroup, ...(bundleIds ? { bundleIds } : {}) });
  }

  const emits: ConnectorManifest["emits"] = [];
  if (!Array.isArray(raw.emits)) problems.push('"emits" must be a list.');
  for (const e of Array.isArray(raw.emits) ? raw.emits : []) {
    const known = isObject(e) && (APP_CATALOG.some((b) => b.id === e.app) || apps.some((a) => a.id === e.app));
    if (!isObject(e) || !(SENSOR_KINDS as readonly string[]).includes(e.kind as string) || typeof e.when !== "string" || !e.when.trim() || e.when.length > 200 || !known) {
      problems.push('Each entry in "emits" needs a kind, a built-in app or one from "apps", and a short "when".');
      continue;
    }
    emits.push({ kind: e.kind as SensorKind, app: e.app as string, when: e.when.trim() });
  }
  if (emits.length === 0 && status !== "planned") problems.push('A connector that isn\'t "planned" must emit something.');

  const privacy = isObject(raw.privacy) ? raw.privacy : {};
  const sends = strings(privacy.sends, "privacy.sends", ALLOWED_FIELDS.length, 10);
  const extra = sends.filter((f) => !(ALLOWED_FIELDS as readonly string[]).includes(f));
  if (extra.length > 0) problems.push(`"privacy.sends" may only list ${ALLOWED_FIELDS.join(", ")} — the bridge rejects anything else (${extra.join(", ")}).`);
  if (!sends.includes("kind") || !sends.includes("app")) problems.push('"privacy.sends" must include kind and app.');
  const neverSends = strings(privacy.neverSends, "privacy.neverSends", 20, 160);
  if (neverSends.length === 0) problems.push('"privacy.neverSends" must say, in plain words, what the connector never sends.');

  const requirements = raw.requirements === undefined ? [] : strings(raw.requirements, "requirements", 10, 160);
  const setup: ConnectorManifest["setup"] = [];
  if (!Array.isArray(raw.setup) || raw.setup.length > 12) problems.push('"setup" must be a list of at most 12 steps.');
  for (const step of Array.isArray(raw.setup) ? raw.setup.slice(0, 12) : []) {
    const code = isObject(step) ? step.code : undefined;
    const codeOk = code === undefined || (isObject(code) && typeof code.language === "string" && LANGUAGES.includes(code.language) && typeof code.content === "string" && code.content.length <= 4000);
    if (!isObject(step) || typeof step.title !== "string" || !step.title.trim() || step.title.length > 100 || (step.body !== undefined && (typeof step.body !== "string" || step.body.length > 1500)) || !codeOk) {
      problems.push(`Each setup step needs a title, an optional body and optional code (${LANGUAGES.join(", ")}).`);
      continue;
    }
    setup.push({
      title: step.title.trim(),
      ...(typeof step.body === "string" && step.body.trim() ? { body: step.body.trim() } : {}),
      ...(isObject(code) ? { code: { language: code.language as string, content: code.content as string } } : {}),
    });
  }

  let test: ConnectorManifest["test"];
  if (raw.test !== undefined) {
    const t = raw.test;
    if (!isObject(t) || typeof t.command !== "string" || !t.command.trim() || t.command.length > 2000 || typeof t.expect !== "string" || t.expect.length > 300) {
      problems.push('"test" needs a command and what to expect.');
    } else test = { command: t.command.trim(), expect: t.expect.trim() };
  }
  let docs: string | undefined;
  if (raw.docs !== undefined) {
    if (typeof raw.docs !== "string" || raw.docs.length > 200 || raw.docs.split(/[\\/]/).includes("..") || /^([a-z]+:|[\\/])/i.test(raw.docs)) {
      problems.push('"docs" must be a relative path inside the repository.');
    } else docs = raw.docs;
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    manifest: { id: id as string, name, publisher, version, category, summary, description, status, platforms: platforms as Platform[], emits, apps, privacy: { sends, neverSends }, requirements, setup, test, docs },
  };
}

/** The apps a connector can report: built-ins it emits plus the ones it introduces. */
export function connectorAppIds(manifest: Pick<ConnectorManifest, "emits" | "apps">): string[] {
  return [...new Set([...manifest.emits.map((e) => e.app), ...manifest.apps.map((a) => a.id)])];
}

/** Manifest apps as registry entries, tagged with the connector that introduced them. */
export function manifestApps(manifest: Pick<ConnectorManifest, "id" | "apps">): AppInfo[] {
  return manifest.apps.map((a) => ({ id: a.id, label: a.label, group: a.group, bundleIds: a.bundleIds ?? [], connector: manifest.id }));
}

/**
 * Fill in the placeholders a manifest may use in its setup code and test
 * command. Inside JSON, values are escaped so a Windows path stays valid JSON.
 */
export function personalize(text: string, values: { dir: string; url: string; connectorDir: string }, options: { json?: boolean } = {}): string {
  const put = (value: string) => (options.json ? JSON.stringify(value).slice(1, -1) : value);
  return text
    .replaceAll("{{FOCUSDECK_DIR}}", put(values.dir))
    .replaceAll("{{FOCUSDECK_URL}}", put(values.url))
    .replaceAll("{{CONNECTOR_DIR}}", put(values.connectorDir));
}
