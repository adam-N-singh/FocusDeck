import { APP_ID_PATTERN, isAppId } from "../focus/apps";
import type { AppId } from "../focus/types";

/**
 * The sensor intake contract — the minimal bridge between thin native
 * sensors and the decision layer (ASSESSMENT.md §6). Privacy is structural
 * here, not a policy promise: an event is five metadata fields and nothing
 * else. Any other field — a title, a message, a URL — rejects the whole
 * event, so content cannot slip in by accident (Privacy Class E).
 */
export const SENSOR_KINDS = ["app-switch", "notification", "agent-needs-input", "agent-finished", "agent-resumed"] as const;
export type SensorKind = (typeof SENSOR_KINDS)[number];

/** The only fields a sensor may send. */
export const ALLOWED_FIELDS = ["kind", "app", "source", "at", "via"] as const;

export const MAX_EVENTS_PER_REQUEST = 100;
/** Opaque agent/session ids only: a sensor hashes whatever native id it has. */
export const SOURCE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** A connector id from the marketplace: the same shape as an app id. */
export const VIA_PATTERN = APP_ID_PATTERN;
const MAX_PAST_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;

export interface SensorEvent {
  kind: SensorKind;
  app: AppId;
  source?: string;
  /** When it happened, epoch ms. */
  at: number;
  /** Which connector sent it, so the marketplace can show each one's status. */
  via?: string;
}

/** A rejection keeps the connector id when it was well formed, so its author can see why. */
export type IntakeResult = { ok: true; event: SensorEvent } | { ok: false; reason: string; via?: string };

const isSensorKind = (v: unknown): v is SensorKind => typeof v === "string" && (SENSOR_KINDS as readonly string[]).includes(v);
const isVia = (v: unknown): v is string => typeof v === "string" && VIA_PATTERN.test(v);

export function parseSensorEvent(raw: unknown, now: number): IntakeResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, reason: "An event must be a JSON object." };
  const { kind, app, source, at, via } = raw as Record<string, unknown>;
  const reject = (reason: string): IntakeResult => (isVia(via) ? { ok: false, reason, via } : { ok: false, reason });
  const extra = Object.keys(raw).find((f) => !(ALLOWED_FIELDS as readonly string[]).includes(f));
  if (extra !== undefined) {
    return reject(`Field "${extra.slice(0, 40)}" is not accepted. FocusDeck takes metadata only (${ALLOWED_FIELDS.join(", ")}) — content is never collected.`);
  }
  if (!isSensorKind(kind)) return reject(`Unknown kind. Expected one of: ${SENSOR_KINDS.join(", ")}.`);
  if (!isAppId(app)) return reject("app must be an app id (lowercase letters, digits and dashes) — map native apps at the sensor.");
  if (source !== undefined && (typeof source !== "string" || !SOURCE_PATTERN.test(source))) {
    return reject("source must be an opaque id (letters, digits, - or _, up to 64) — hash native ids at the sensor.");
  }
  if (via !== undefined && !isVia(via)) return reject("via must be the connector's id (lowercase letters, digits and dashes, up to 40).");
  let when = now;
  if (at !== undefined) {
    const parsed = typeof at === "number" ? at : typeof at === "string" ? Date.parse(at) : Number.NaN;
    if (!Number.isFinite(parsed)) return reject("at must be epoch milliseconds or an ISO timestamp.");
    if (parsed < now - MAX_PAST_MS || parsed > now + MAX_FUTURE_MS) return reject("at is too far from now (more than a day old, or in the future).");
    when = parsed;
  }
  const event: SensorEvent = { kind, app, at: when };
  if (typeof source === "string") event.source = source;
  if (isVia(via)) event.via = via;
  return { ok: true, event };
}

export interface ParsedBatch {
  events: SensorEvent[];
  rejected: { index: number; reason: string; via?: string }[];
}

/** Accepts one event, an array of events, or `{ "events": [...] }` — and nothing else in the envelope. */
export function parseSensorBatch(body: unknown, now: number): ParsedBatch {
  let items: unknown[];
  if (Array.isArray(body)) items = body;
  else if (typeof body === "object" && body !== null && "events" in body) {
    const keys = Object.keys(body);
    if (keys.length !== 1) return { events: [], rejected: [{ index: -1, reason: 'The envelope may only contain "events".' }] };
    const events = (body as { events: unknown }).events;
    if (!Array.isArray(events)) return { events: [], rejected: [{ index: -1, reason: '"events" must be an array.' }] };
    items = events;
  } else items = [body];

  if (items.length > MAX_EVENTS_PER_REQUEST) {
    return { events: [], rejected: [{ index: -1, reason: `At most ${MAX_EVENTS_PER_REQUEST} events per request.` }] };
  }
  const parsed: ParsedBatch = { events: [], rejected: [] };
  items.forEach((item, index) => {
    const result = parseSensorEvent(item, now);
    if (result.ok) parsed.events.push(result.event);
    else parsed.rejected.push(result.via ? { index, reason: result.reason, via: result.via } : { index, reason: result.reason });
  });
  return parsed;
}

/** Defense in depth: the bridge re-applies the designated-app filter sensors already applied. */
export function filterDesignated(events: SensorEvent[], designated: readonly AppId[]): { kept: SensorEvent[]; dropped: number } {
  const kept = events.filter((e) => designated.includes(e.app));
  return { kept, dropped: events.length - kept.length };
}
