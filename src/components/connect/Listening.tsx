"use client";

import { useState } from "react";
import { useConnectorCatalog } from "@/lib/client/connectors";
import { ago, useAppState, useNow } from "@/lib/client/hooks";
import { KEYS, readJson, writeJson } from "@/lib/client/persist";
import { store } from "@/lib/client/store";
import { Button, Disclosure, Dot, Toggle, inputClass } from "@/components/ui/primitives";

/** Only needed when the server sets FOCUSDECK_SENSOR_TOKEN. Write-only: a saved token is never shown again. */
function TokenField() {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(() => typeof window !== "undefined" && typeof readJson(KEYS.token) === "string");
  const save = (token: string) => {
    writeJson(KEYS.token, token);
    setSaved(Boolean(token));
    setValue("");
  };
  return (
    <Disclosure title="Sensor token" meta={saved ? "one is saved" : "only if your server asks for one"}>
      <p className="max-w-[60ch] text-sm leading-6 text-ink-2">
        If the server sets <code className="text-ink">FOCUSDECK_SENSOR_TOKEN</code>, every client must present it, this page included. It’s kept in this browser only and never shown again.
      </p>
      <form className="mt-3 flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); if (value) save(value); }}>
        <input type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste the token" className={inputClass} aria-label="Sensor token" />
        <Button type="submit" size="md" disabled={!value}>Save</Button>
        {saved && <Button size="md" variant="ghost" onClick={() => save("")}>Forget</Button>}
      </form>
    </Disclosure>
  );
}

/**
 * Whether FocusDeck is listening for connectors at all, and who it has heard
 * from. Lives at the top of Connect, because it's what every connector needs.
 */
export function Listening() {
  const state = useAppState();
  const catalog = useConnectorCatalog();
  const now = useNow();
  if (!state.hydrated) return null;
  const { bridge } = state;
  const heard = Object.entries(bridge.stats?.byConnector ?? {})
    .flatMap(([id, s]) => (s.lastEventAt ? [{ id, at: s.lastEventAt }] : []))
    .sort((a, b) => b.at - a.at);
  const name = (id: string) => catalog.connectors.find((c) => c.id === id)?.name ?? id;
  const status = !bridge.enabled ? "Not listening" : bridge.connected ? "Listening" : "Can’t reach the bridge";

  return (
    <section aria-label="Listening for connectors" className={`rounded-2xl border bg-surface p-5 sm:p-6 ${bridge.enabled ? "border-line" : "border-attention/40"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Toggle
          checked={bridge.enabled}
          onChange={(enabled) => store.setBridge({ enabled })}
          label="Listen for connectors"
          description="Connectors on this machine post small, metadata-only events here. Turn this off and FocusDeck hears nothing."
        />
        <p className={`inline-flex items-center gap-2 text-sm ${bridge.enabled && !bridge.connected ? "text-attention" : "text-ink-2"}`} aria-live="polite">
          <Dot tone={!bridge.enabled ? "muted" : bridge.connected ? "accent" : "attention"} />
          {status}
        </p>
      </div>
      {!bridge.enabled && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="max-w-[56ch] text-sm leading-6 font-medium text-attention">
            Listening is off, so your connectors can send but nothing reaches FocusDeck.
          </p>
          <Button size="sm" variant="primary" onClick={() => store.setBridge({ enabled: true })}>Turn listening on</Button>
        </div>
      )}
      {bridge.lastError && bridge.enabled && <p className="mt-3 text-sm text-attention">{bridge.lastError}</p>}
      {(heard.length > 0 || bridge.stats) && (
        <div className="mt-4 space-y-1 text-sm leading-6 text-ink-2">
          {heard.length > 0 && (
            <p>
              Heard from{" "}
              {heard.map((h, i) => (
                <span key={h.id}>
                  {i > 0 && (i === heard.length - 1 ? " and " : ", ")}
                  <span className="text-ink">{name(h.id)}</span> {now ? ago(h.at, now) : "recently"}
                </span>
              ))}
              .
            </p>
          )}
          {bridge.stats && (
            <p className="text-ink-3">
              Since the server started: {bridge.stats.accepted} accepted, {bridge.stats.dropped} dropped because the app isn’t chosen, {bridge.stats.rejected} rejected for carrying more than metadata.
            </p>
          )}
        </div>
      )}
      <div className="mt-3">
        <TokenField />
      </div>
    </section>
  );
}
