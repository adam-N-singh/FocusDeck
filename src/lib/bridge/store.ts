import { allApps, isAppId } from "../focus/apps";
import { designatedSites, normalizeSites, type SiteLists } from "../focus/sites";
import type { AppId } from "../focus/types";
import { ALLOWED_FIELDS, SENSOR_KINDS, filterDesignated, parseSensorBatch, type SensorEvent } from "./intake";

/**
 * The bridge's in-memory buffer (server side). Sensors POST metadata events
 * here; the FocusDeck app polls them into the deck. Deliberately not durable:
 * the app's local store is the record, and the bridge only holds the last
 * few hundred events in flight. Lives on globalThis so dev hot-reloads keep it.
 *
 * Until the app has told the bridge which apps are designated, everything is
 * dropped — not designated means not seen.
 */
export const BUFFER_SIZE = 1000;
export const READ_LIMIT = 200;
/** Per-connector stats are bounded: a misbehaving client can't grow memory with made-up ids. */
export const MAX_TRACKED_CONNECTORS = 64;

export interface StoredSensorEvent extends SensorEvent {
  seq: number;
  receivedAt: number;
}

/** What one connector has sent since the server started — counts and times, never payloads. */
export interface ConnectorStats {
  accepted: number;
  /** Arrived for an app that isn't designated, so it was dropped unseen. */
  dropped: number;
  rejected: number;
  lastEventAt: number | null;
  lastRejection: string | null;
}

export interface BridgeStats {
  accepted: number;
  dropped: number;
  rejected: number;
  lastEventAt: number | null;
  configuredAt: number | null;
  /** Keyed by the connector id each event named in `via`. */
  byConnector: Record<string, ConnectorStats>;
}

interface Bridge {
  seq: number;
  events: StoredSensorEvent[];
  designatedApps: AppId[];
  sites: SiteLists;
  configured: boolean;
  stats: BridgeStats;
}

const KEY = Symbol.for("focusdeck.sensor-bridge");

const fresh = (): Bridge => ({
  seq: 0,
  events: [],
  designatedApps: [],
  sites: {},
  configured: false,
  stats: { accepted: 0, dropped: 0, rejected: 0, lastEventAt: null, configuredAt: null, byConnector: {} },
});

function bridge(): Bridge {
  const g = globalThis as typeof globalThis & { [KEY]?: Bridge };
  g[KEY] ??= fresh();
  return g[KEY];
}

export function resetBridge(): void {
  (globalThis as typeof globalThis & { [KEY]?: Bridge })[KEY] = fresh();
}

export interface IngestResult {
  accepted: number;
  dropped: number;
  rejected: { index: number; reason: string }[];
  configured: boolean;
}

const emptyConnector = (): ConnectorStats => ({ accepted: 0, dropped: 0, rejected: 0, lastEventAt: null, lastRejection: null });

function tally(byConnector: Record<string, ConnectorStats>, via: string | undefined, change: (s: ConnectorStats) => ConnectorStats) {
  if (!via) return;
  if (!byConnector[via] && Object.keys(byConnector).length >= MAX_TRACKED_CONNECTORS) return;
  byConnector[via] = change(byConnector[via] ?? emptyConnector());
}

export function ingest(body: unknown, now = Date.now()): IngestResult {
  const b = bridge();
  const { events, rejected } = parseSensorBatch(body, now);
  const { kept, dropped } = b.configured ? filterDesignated(events, b.designatedApps) : { kept: [], dropped: events.length };
  for (const event of kept) {
    b.seq += 1;
    b.events.push({ ...event, seq: b.seq, receivedAt: now });
  }
  if (b.events.length > BUFFER_SIZE) b.events.splice(0, b.events.length - BUFFER_SIZE);

  const byConnector = { ...b.stats.byConnector };
  const keptSet = new Set(kept);
  for (const event of events) {
    tally(byConnector, event.via, (s) =>
      keptSet.has(event) ? { ...s, accepted: s.accepted + 1, lastEventAt: now } : { ...s, dropped: s.dropped + 1 });
  }
  for (const r of rejected) tally(byConnector, r.via, (s) => ({ ...s, rejected: s.rejected + 1, lastRejection: r.reason }));

  b.stats = {
    ...b.stats,
    accepted: b.stats.accepted + kept.length,
    dropped: b.stats.dropped + dropped,
    rejected: b.stats.rejected + rejected.length,
    lastEventAt: kept.length > 0 ? now : b.stats.lastEventAt,
    byConnector,
  };
  return { accepted: kept.length, dropped, rejected: rejected.map(({ index, reason }) => ({ index, reason })), configured: b.configured };
}

export function readSince(after: number, limit = READ_LIMIT) {
  const b = bridge();
  const events = b.events.filter((e) => e.seq > after).slice(0, limit);
  return { events, lastSeq: events.at(-1)?.seq ?? Math.max(after, b.seq), headSeq: b.seq, stats: b.stats, configured: b.configured };
}

export function getStats(): BridgeStats {
  return bridge().stats;
}

export function getConfig() {
  const b = bridge();
  return {
    configured: b.configured,
    designatedApps: b.designatedApps,
    kinds: SENSOR_KINDS,
    fields: ALLOWED_FIELDS,
    // Sensors filter at the sensor: they map native ids onto these, and drop everything else.
    apps: allApps().filter((app) => b.designatedApps.includes(app.id)).map(({ id, bundleIds }) => ({ id, bundleIds })),
    // The browser connector matches tabs against these locally and sends only the category.
    sites: designatedSites(b.sites, b.designatedApps),
  };
}

export function setConfig(raw: unknown, now = Date.now()) {
  const b = bridge();
  const body = typeof raw === "object" && raw !== null ? (raw as { designatedApps?: unknown; sites?: unknown }) : {};
  if (!Array.isArray(body.designatedApps)) return { ok: false as const, reason: "Expected { designatedApps: [...], sites?: {...} }." };
  b.designatedApps = [...new Set(body.designatedApps.filter(isAppId))];
  if (body.sites !== undefined) b.sites = normalizeSites(body.sites, {});
  b.configured = true;
  b.stats = { ...b.stats, configuredAt: now };
  // Forget buffered events from apps that are no longer designated.
  b.events = b.events.filter((e) => b.designatedApps.includes(e.app));
  return { ok: true as const, config: getConfig() };
}
