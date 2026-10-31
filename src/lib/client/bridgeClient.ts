import type { StoredSensorEvent } from "../bridge/store";
import { authHeaders } from "./persist";
import { store } from "./store";
import { epochToMinute } from "./time";

/**
 * The app's side of the sensor bridge: tell the bridge which apps are
 * designated (so sensors can filter at the sensor), and pull new events into
 * the live deck. Same-origin requests only; nothing here leaves the machine.
 */
interface EventsResponse {
  events: StoredSensorEvent[];
  lastSeq: number;
  headSeq: number;
  configured: boolean;
  stats: NonNullable<ReturnType<typeof store.getSnapshot>["bridge"]["stats"]>;
  error?: string;
}

export async function pushBridgeConfig(): Promise<void> {
  const { model, bridge } = store.getSnapshot();
  if (!bridge.enabled) return;
  try {
    const res = await fetch("/api/sensor/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ designatedApps: model.designatedApps }),
    });
    store.setBridge({ configured: res.ok, lastError: res.ok ? null : `Config rejected (${res.status})` });
  } catch {
    store.setBridge({ connected: false, lastError: "The bridge isn't reachable." });
  }
}

export async function pollBridge(): Promise<void> {
  const { bridge } = store.getSnapshot();
  if (!bridge.enabled) return;
  try {
    const res = await fetch(`/api/sensor/events?after=${bridge.lastSeq}`, { cache: "no-store", headers: authHeaders() });
    const data = (await res.json()) as EventsResponse;
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    // A restarted server starts its sequence again: catch up from the beginning.
    if (data.headSeq < bridge.lastSeq) {
      store.setBridge({ lastSeq: 0 });
      return;
    }
    const now = new Date();
    for (const event of data.events) {
      const at = epochToMinute(event.at, now);
      if (event.kind === "agent-resumed") store.dispatchLive({ type: "agent-resumed", at, app: event.app, source: event.source });
      else store.dispatchLive({ type: "event", at, input: { kind: event.kind, app: event.app, source: event.source, origin: "sensor" } });
    }
    store.setBridge({ connected: true, configured: data.configured, lastSeq: data.lastSeq, stats: data.stats, lastError: null });
    if (!data.configured) await pushBridgeConfig();
  } catch (error) {
    store.setBridge({ connected: false, lastError: error instanceof Error ? error.message : "The bridge isn't reachable." });
  }
}
