import type { ConnectorStats } from "@/lib/bridge/store";
import type { ConnectorCategory } from "@/lib/connectors/manifest";
import { ago } from "@/lib/client/hooks";

export const CATEGORY_LABEL: Record<ConnectorCategory, string> = {
  agents: "AI agents",
  editor: "Editors",
  comms: "Comms",
  browser: "Browser",
  os: "Your computer",
  tasks: "Tasks and PRs",
  generic: "Generic",
};

/** How finished a connector is, in plain words. Ready needs no label. */
export const MATURITY = {
  ready: null,
  spike: "Experimental",
  planned: "Planned",
} as const;

export interface LiveLine {
  tone: "accent" | "muted" | "attention";
  text: string;
}

/** Where a connector stands, from what the bridge has counted (never what was sent). */
export function connectionLine(added: boolean, stats: ConnectorStats | undefined, now: number): LiveLine | null {
  if (stats?.lastEventAt) return { tone: "accent", text: `Live, last event ${now ? ago(stats.lastEventAt, now) : "recently"}` };
  if (stats?.rejected) return { tone: "attention", text: "Its events are being rejected" };
  if (stats?.dropped) return { tone: "attention", text: "Sending, but its apps aren’t chosen" };
  if (added) return { tone: "muted", text: "Added, waiting for its first event" };
  return null;
}

export const listWords = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
