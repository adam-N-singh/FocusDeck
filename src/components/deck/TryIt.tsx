"use client";

import { useState } from "react";
import { appLabel, isAgentApp } from "@/lib/focus/apps";
import type { AppId, EventKind } from "@/lib/focus/types";
import { useDeck } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { Button, Disclosure } from "@/components/ui/primitives";

const MOMENTS: { label: string; kind: EventKind; app: AppId }[] = [
  { label: "An agent needs me", kind: "agent-needs-input", app: "claude-code" },
  { label: "An agent finishes", kind: "agent-finished", app: "cursor-agent" },
  { label: "A Slack notification", kind: "notification", app: "slack" },
  { label: "I open X", kind: "app-switch", app: "browser-x" },
  { label: "I open Slack", kind: "app-switch", app: "slack" },
  { label: "I switch to the editor", kind: "app-switch", app: "editor" },
  { label: "I switch to the terminal", kind: "app-switch", app: "terminal" },
];

/** See FocusDeck work before any sensor is connected: a whole sample day, or one moment at a time. */
export function TryIt() {
  const { state, isDemo } = useDeck();
  const [agents, setAgents] = useState(2);
  const { model } = state;
  const visible = MOMENTS.filter((m) => model.designatedApps.includes(m.app));
  const send = (m: (typeof MOMENTS)[number]) => store.dispatch({ type: "event", at: store.now(), input: { kind: m.kind, app: m.app, origin: "manual" } });

  return (
    <Disclosure title="Try it without sensors">
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="text-base font-medium text-ink">Play a sample day</h3>
          <p className="mt-1 max-w-[52ch] text-sm leading-6 text-ink-2">
            A day of agents and distractions on a fast clock, in its own space. Nothing from it reaches your week.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={() => store.startDemo({ scenario: "x-post" })}>Play the sample day</Button>
            <Button size="sm" onClick={() => store.startDemo({ scenario: "simulated", parallelAgents: agents, seed: Math.floor(Math.random() * 1000) })}>
              Simulate {agents} agent{agents === 1 ? "" : "s"}
            </Button>
            {isDemo && <Button size="sm" variant="ghost" onClick={() => store.stopDemo()}>Stop</Button>}
          </div>
          <label className="mt-4 flex max-w-xs items-center gap-3 text-sm text-ink-2">
            Agents at once
            <input type="range" min={1} max={6} value={agents} onChange={(e) => setAgents(Number(e.target.value))} className="flex-1" aria-label="Agents running at once" />
            <span className="w-3 text-ink tabular-nums">{agents}</span>
          </label>
        </div>
        <div>
          <h3 className="text-base font-medium text-ink">Send a test moment</h3>
          <p className="mt-1 max-w-[52ch] text-sm leading-6 text-ink-2">One event, as if a sensor had sent it. Marked as a test and never counted in your week.</p>
          {visible.length === 0 ? (
            <p className="mt-4 text-sm text-ink-2">Choose some apps in Setup first. FocusDeck can’t see the others.</p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {visible.map((m) => (
                <Button key={m.label} size="sm" onClick={() => send(m)} title={`${appLabel(m.app)}`}>
                  {m.label}
                </Button>
              ))}
              {model.designatedApps.some(isAgentApp) && (
                <Button size="sm" variant="ghost" onClick={() => store.dispatch({ type: "agent-resumed", at: store.now(), app: "claude-code" })}>
                  The agent picked up again
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Disclosure>
  );
}
