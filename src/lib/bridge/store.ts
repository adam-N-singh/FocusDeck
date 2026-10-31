import { APP_CATALOG, isAppId } from "../focus/apps";
import type { AppId } from "../focus/types";
import { SENSOR_KINDS, filterDesignated, parseSensorBatch, type SensorEvent } from "./intake";

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

export interface StoredSensorEvent extends SensorEvent {
  seq: number;
  receivedAt: number;
}

export interface BridgeStats {
  accepted: number;
  dropped: number;
  rejected: number;
  lastEventAt: number | null;
  configuredAt: number | null;
}

interface Bridge {
  seq: number;
  events: StoredSensorEvent[];
  designatedApps: AppId[];
  configured: boolean;
  stats: BridgeStats;
}

const KEY = Symbol.for("focusdeck.sensor-bridge");

const fresh = (): Bridge => ({
  seq: 0,
  events: [],
  designatedApps: [],
  configured: false,
  stats: { accepted: 0, dropped: 0, rejected: 0, lastEventAt: null, configuredAt: null },
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

export function ingest(body: unknown, now = Date.now()): IngestResult {
  const b = bridge();
  const { events, rejected } = parseSensorBatch(body, now);
  const { kept, dropped } = b.configured ? filterDesignated(events, b.designatedApps) : { kept: [], dropped: events.length };
  for (const event of kept) {
    b.seq += 1;
    b.events.push({ ...event, seq: b.seq, receivedAt: now });
  }
  if (b.events.length > BUFFER_SIZE) b.events.splice(0, b.events.length - BUFFER_SIZE);
  b.stats = {
    ...b.stats,
    accepted: b.stats.accepted + kept.length,
    dropped: b.stats.dropped + dropped,
    rejected: b.stats.rejected + rejected.length,
    lastEventAt: kept.length > 0 ? now : b.stats.lastEventAt,
  };
  return { accepted: kept.length, dropped, rejected, configured: b.configured };
}

export function readSince(after: number, limit = READ_LIMIT) {
  const b = bridge();
  const events = b.events.filter((e) => e.seq > after).slice(0, limit);
  return { events, lastSeq: events.at(-1)?.seq ?? Math.max(after, b.seq), headSeq: b.seq, stats: b.stats, configured: b.configured };
}

export function getConfig() {
  const b = bridge();
  return {
    configured: b.configured,
    designatedApps: b.designatedApps,
    kinds: SENSOR_KINDS,
    fields: ["kind", "app", "source", "at"],
    // Sensors filter at the sensor: they map native ids onto these, and drop everything else.
    apps: APP_CATALOG.filter((app) => b.designatedApps.includes(app.id)).map(({ id, bundleIds }) => ({ id, bundleIds })),
  };
}

export function setConfig(raw: unknown, now = Date.now()) {
  const b = bridge();
  const list = typeof raw === "object" && raw !== null ? (raw as { designatedApps?: unknown }).designatedApps : undefined;
  if (!Array.isArray(list)) return { ok: false as const, reason: "Expected { designatedApps: [...] }." };
  b.designatedApps = [...new Set(list.filter(isAppId))];
  b.configured = true;
  b.stats = { ...b.stats, configuredAt: now };
  // Forget buffered events from apps that are no longer designated.
  b.events = b.events.filter((e) => b.designatedApps.includes(e.app));
  return { ok: true as const, config: getConfig() };
}
