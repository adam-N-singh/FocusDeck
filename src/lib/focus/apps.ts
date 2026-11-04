/**
 * The designatable app catalog. FocusDeck may only ever see apps the user
 * designates (Privacy: designated-app signals only, per-app opt-in). Sensors
 * map native identifiers onto these ids and drop everything else *at the
 * sensor*, so the app layer structurally cannot see undesignated activity
 * (ASSESSMENT.md §4.7).
 *
 * Nine apps are built in; connectors from the marketplace can add more (a
 * Codex CLI, GitHub…). An app id is therefore any well-formed id — what gates
 * it is designation, never membership in a list.
 */
export type BuiltInAppId =
  | "editor" | "terminal" | "claude-code" | "cursor-agent"
  | "slack" | "browser-docs" | "browser-x" | "notes" | "calendar";

/** A built-in app, or one a connector introduced. `(string & {})` keeps autocomplete. */
export type AppId = BuiltInAppId | (string & {});

export type AppGroup = "work" | "agents" | "comms" | "browser" | "tasks";

export interface AppInfo {
  id: AppId;
  label: string;
  group: AppGroup;
  /**
   * macOS bundle ids a sensor may map to this app. Browser categories have none:
   * telling X from docs is the browser connector's job, by hostname, locally.
   */
  bundleIds: string[];
  /** The connector that introduced it, for apps that aren't built in. */
  connector?: string;
}

export const APP_CATALOG: AppInfo[] = [
  { id: "editor", label: "Editor", group: "work", bundleIds: ["com.microsoft.VSCode", "dev.zed.Zed", "com.apple.dt.Xcode", "com.jetbrains.intellij"] },
  { id: "terminal", label: "Terminal", group: "work", bundleIds: ["com.apple.Terminal", "com.googlecode.iterm2", "dev.warp.Warp-Stable", "com.mitchellh.ghostty"] },
  { id: "notes", label: "Notes", group: "work", bundleIds: ["com.apple.Notes", "md.obsidian", "notion.id"] },
  { id: "claude-code", label: "Claude Code", group: "agents", bundleIds: ["com.anthropic.claudefordesktop"] },
  { id: "cursor-agent", label: "Cursor agent", group: "agents", bundleIds: ["com.todesktop.230313mzl4w4u92"] },
  { id: "slack", label: "Slack", group: "comms", bundleIds: ["com.tinyspeck.slackmacgap"] },
  { id: "calendar", label: "Calendar", group: "comms", bundleIds: ["com.apple.iCal"] },
  { id: "browser-docs", label: "Browser — docs", group: "browser", bundleIds: [] },
  { id: "browser-x", label: "Browser — X", group: "browser", bundleIds: [] },
];

/** The built-in ids. The demo model designates these. */
export const APP_IDS: AppId[] = APP_CATALOG.map((app) => app.id);

/** Lowercase letters, digits and dashes — the same shape as a connector id. */
export const APP_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const isAppId = (value: unknown): value is AppId => typeof value === "string" && APP_ID_PATTERN.test(value);

// Apps contributed by connectors. Registered by the connector loader on the
// server and from /api/connectors in the browser; built-ins always win.
const contributed = new Map<string, AppInfo>();

export function registerApps(apps: AppInfo[]): void {
  for (const app of apps) {
    if (isAppId(app.id) && !APP_CATALOG.some((b) => b.id === app.id)) contributed.set(app.id, app);
  }
}

/** Built-ins first, then every app a known connector introduced. */
export function allApps(): AppInfo[] {
  return [...APP_CATALOG, ...contributed.values()];
}

export function appInfo(id: AppId): AppInfo | undefined {
  return APP_CATALOG.find((app) => app.id === id) ?? contributed.get(id);
}

export const appLabel = (id: AppId): string => appInfo(id)?.label ?? id;

/** Agent surfaces: events from these are the user's own delegated work. */
export const isAgentApp = (id: AppId): boolean => appInfo(id)?.group === "agents";
