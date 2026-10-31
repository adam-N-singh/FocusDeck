"use client";

import { useState } from "react";
import { AGENT_APPS, appLabel } from "@/lib/focus/apps";
import type { AppId, EventKind } from "@/lib/focus/types";
import { useDeck } from "@/lib/client/hooks";
import { KEYS, readJson, writeJson } from "@/lib/client/persist";
import { store } from "@/lib/client/store";
import { Badge, Button, Panel, Toggle, inputClass } from "@/components/ui/primitives";

const TRY: { label: string; kind: EventKind; app: AppId }[] = [
  { label: "An agent blocks on me", kind: "agent-needs-input", app: "claude-code" },
  { label: "An agent finishes", kind: "agent-finished", app: "cursor-agent" },
  { label: "A Slack notification", kind: "notification", app: "slack" },
  { label: "I open X", kind: "app-switch", app: "browser-x" },
  { label: "I open Slack", kind: "app-switch", app: "slack" },
  { label: "I switch to the editor", kind: "app-switch", app: "editor" },
  { label: "I switch to the terminal", kind: "app-switch", app: "terminal" },
];

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
    <details className="text-xs text-zinc-500">
      <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">Using a sensor token?{saved ? " (one is saved)" : ""}</summary>
      <p className="mt-2 leading-5">If the server sets FOCUSDECK_SENSOR_TOKEN, every client must present it — this page included. It’s kept in this browser only.</p>
      <div className="mt-2 flex gap-2">
        <input type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste the token" className={inputClass} aria-label="Sensor token" />
        <Button size="sm" disabled={!value} onClick={() => save(value)}>Save</Button>
        {saved && <Button size="sm" variant="ghost" onClick={() => save("")}>Forget</Button>}
      </div>
    </details>
  );
}

/** Where events come from: real sensors through the bridge, a replayed demo day, or a test tap. */
export function SourcesPanel() {
  const { state, isDemo } = useDeck();
  const [agents, setAgents] = useState(2);
  if (!state.hydrated) return null;
  const { bridge, model } = state;
  const visible = TRY.filter((t) => model.designatedApps.includes(t.app));
  const tryEvent = (t: (typeof TRY)[number]) =>
    store.dispatch({ type: "event", at: store.now(), input: { kind: t.kind, app: t.app, origin: "manual" } });

  return (
    <Panel title="Sources" kicker="How FocusDeck notices">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2 rounded-xl bg-zinc-950/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-zinc-200">Sensor bridge</h3>
            <Badge tone={!bridge.enabled ? "zinc" : bridge.connected ? "sky" : "red"}>
              {!bridge.enabled ? "off" : bridge.connected ? "connected" : "unreachable"}
            </Badge>
          </div>
          <Toggle checked={bridge.enabled} onChange={(enabled) => store.setBridge({ enabled })} label="Listen for sensor events" description="Claude Code hooks and the macOS sensor post metadata-only events here." />
          {bridge.stats && (
            <p className="text-xs leading-5 text-zinc-500">
              Accepted {bridge.stats.accepted} · dropped {bridge.stats.dropped} (undesignated) · rejected {bridge.stats.rejected} (bad or content-bearing fields)
            </p>
          )}
          {bridge.lastError && <p className="text-xs text-red-300">{bridge.lastError}</p>}
          <p className="text-xs leading-5 text-zinc-500">Set up sensors from <code className="text-zinc-300">sensors/README.md</code>. Events land in your real day, even during a demo.</p>
          <TokenField />
        </div>

        <div className="space-y-2 rounded-xl bg-zinc-950/60 p-4">
          <h3 className="text-sm font-medium text-zinc-200">Demo day</h3>
          <p className="text-xs leading-5 text-zinc-500">Replays a day into a separate demo deck on a fast clock. Nothing from a demo reaches your mirror.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => store.startDemo({ scenario: "x-post" })}>Replay the X-post day</Button>
            <Button size="sm" onClick={() => store.startDemo({ scenario: "simulated", parallelAgents: agents, seed: Math.floor(Math.random() * 1000) })}>
              Simulate an agent day
            </Button>
          </div>
          <label className="block text-xs text-zinc-400">
            Parallel agents: <span className="font-semibold text-zinc-100">{agents}</span>
            <input type="range" min={1} max={6} value={agents} onChange={(e) => setAgents(Number(e.target.value))} className="ml-2 align-middle accent-emerald-400" />
          </label>
          {isDemo && <Button size="sm" variant="ghost" onClick={() => store.stopDemo()}>Stop the demo</Button>}
        </div>

        <div className="space-y-2 rounded-xl bg-zinc-950/60 p-4">
          <h3 className="text-sm font-medium text-zinc-200">Try a moment</h3>
          <p className="text-xs leading-5 text-zinc-500">
            Sends one test event to the deck on screen. Test events are marked in the log and never counted in your mirror.
          </p>
          {visible.length === 0 ? (
            <p className="text-xs text-amber-200/90">No designated apps yet — FocusDeck can’t see anything until you designate apps in Declare.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {visible.map((t) => (
                <Button key={t.label} size="sm" onClick={() => tryEvent(t)} title={`${t.kind} · ${appLabel(t.app)}`}>
                  {t.label}
                </Button>
              ))}
            </div>
          )}
          {model.designatedApps.some((a) => AGENT_APPS.includes(a)) && (
            <Button size="sm" variant="ghost" onClick={() => store.dispatch({ type: "agent-resumed", at: store.now(), app: "claude-code" })}>
              The agent resumed (I replied)
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}
