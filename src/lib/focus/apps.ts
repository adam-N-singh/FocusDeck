import type { AppId } from "./types";

/**
 * The designatable app catalog. FocusDeck may only ever see apps the user
 * designates from this list (Privacy: designated-app signals only, per-app
 * opt-in). Sensors map native identifiers onto these ids and drop everything
 * else *at the sensor*, so the app layer structurally cannot see undesignated
 * activity (ASSESSMENT.md §4.7).
 */
export interface AppInfo {
  id: AppId;
  label: string;
  group: "work" | "agents" | "comms" | "browser";
  /**
   * macOS bundle ids a sensor may map to this app. Browser categories have none:
   * telling X from docs needs the URL, which a sensor must not read — see BUILD-NOTES.md.
   */
  bundleIds: string[];
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

export const APP_IDS: AppId[] = APP_CATALOG.map((app) => app.id);

const LABELS = Object.fromEntries(APP_CATALOG.map((app) => [app.id, app.label])) as Record<AppId, string>;

export const appLabel = (id: AppId): string => LABELS[id] ?? id;

export const isAppId = (value: unknown): value is AppId =>
  typeof value === "string" && (APP_IDS as string[]).includes(value);

/** Agent surfaces: events from these are the user's own delegated work. */
export const AGENT_APPS: AppId[] = ["claude-code", "cursor-agent"];
