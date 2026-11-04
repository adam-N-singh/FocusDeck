import { useSyncExternalStore } from "react";
import type { ConnectorStats } from "../bridge/store";
import { registerApps } from "../focus/apps";
import { manifestApps, type ConnectorManifest } from "../connectors/manifest";
import { authHeaders } from "./persist";

/**
 * The page's copy of the connector marketplace (GET /api/connectors). Loading
 * it also registers the apps connectors introduce, so labels and the Declare
 * app list know them. Same-origin only; nothing here leaves the machine.
 */
export interface MarketConnector extends ConnectorManifest {
  origin: "built-in" | "local";
  verified: boolean;
}

export interface ConnectorCatalogView {
  status: "idle" | "loading" | "ready" | "error";
  connectors: MarketConnector[];
  errors: { path: string; problems: string[] }[];
  repoDir: string | null;
  url: string | null;
  /** What each connector has sent since the server started, as of the last load. */
  stats: Record<string, ConnectorStats>;
  error: string | null;
}

const EMPTY: ConnectorCatalogView = { status: "idle", connectors: [], errors: [], repoDir: null, url: null, stats: {}, error: null };
let view: ConnectorCatalogView = EMPTY;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function set(next: ConnectorCatalogView) {
  view = next;
  listeners.forEach((listener) => listener());
}

export function refreshConnectors(): Promise<void> {
  inflight ??= (async () => {
    if (view.status === "idle") set({ ...view, status: "loading" });
    try {
      const res = await fetch("/api/connectors", { cache: "no-store", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const connectors = data.connectors as MarketConnector[];
      for (const connector of connectors) registerApps(manifestApps(connector));
      set({ status: "ready", connectors, errors: data.errors ?? [], repoDir: data.repoDir, url: data.url, stats: data.stats ?? {}, error: null });
    } catch (error) {
      set({ ...view, status: "error", error: error instanceof Error ? error.message : "Couldn't load the connector catalog." });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useConnectorCatalog(): ConnectorCatalogView {
  return useSyncExternalStore(subscribe, () => view, () => EMPTY);
}
