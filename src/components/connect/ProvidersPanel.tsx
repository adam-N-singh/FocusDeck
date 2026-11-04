"use client";

import { useEffect, useState } from "react";
import { PROVIDERS, type ProviderAccess, type ProviderId } from "@/lib/systemTwo/providerCatalog";
import type { UserModel } from "@/lib/focus/model";
import { useAppState } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { fetchSystemTwoStatus, testProvider, type ProviderStatus, type ProviderTestResult } from "@/lib/client/systemTwoClient";
import { Badge, Button, Panel, Skeleton, Toggle } from "@/components/ui/primitives";

const GROUPS: { access: ProviderAccess; title: string; note: string }[] = [
  { access: "subscription", title: "Your subscriptions", note: "Runs the provider’s own CLI on this machine, signed in as you. FocusDeck never sees or stores your login." },
  { access: "api-key", title: "API keys", note: "Keys stay in the server’s environment and never reach this page. API usage is billed separately from a chat subscription." },
  { access: "local", title: "On this machine", note: "Nothing leaves your computer." },
];

const update = (fn: (m: UserModel) => UserModel) => store.setModel(fn(store.getSnapshot().model));

function ProviderRow({ id, status, selected }: { id: ProviderId; status?: ProviderStatus; selected: boolean }) {
  const info = PROVIDERS.find((p) => p.id === id)!;
  const [test, setTest] = useState<ProviderTestResult | "running" | null>(null);
  const run = async () => {
    setTest("running");
    setTest((await testProvider(id)) ?? { ok: false, reason: "FocusDeck's server didn't answer.", ms: 0 });
  };
  return (
    <li className={`rounded-xl border p-3 ${selected ? "border-emerald-700 bg-zinc-900" : "border-zinc-800 bg-zinc-950/60"}`}>
      <div className="flex flex-wrap items-start gap-3">
        <input
          type="radio"
          name="system-two-provider"
          className="mt-1 h-4 w-4 accent-emerald-400"
          checked={selected}
          onChange={() => update((m) => ({ ...m, systemTwoProvider: id }))}
          aria-label={`Use ${info.label}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-zinc-100">{info.label}</p>
            {status ? <Badge tone={status.ready ? "sky" : "zinc"}>{status.ready ? "Set up" : "Not set up"}</Badge> : <Badge>Checking…</Badge>}
          </div>
          {status && <p className="mt-1 text-xs leading-5 text-zinc-400">{status.detail}{status.model ? ` Model: ${status.model}.` : ""}</p>}
          <p className="mt-1 text-xs leading-5 text-zinc-500">Pays with: {info.billing} Goes to: {info.destination}</p>
          <p className="mt-1 flex flex-wrap gap-1">
            {info.env.map((name) => <code key={name} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300">{name}</code>)}
          </p>
          {test && test !== "running" && (
            <p className={`mt-2 text-xs leading-5 ${test.ok ? "text-emerald-300" : "text-amber-200/90"}`}>
              {test.ok ? `Answered “${test.text}” in ${(test.ms / 1000).toFixed(1)} s${test.model ? ` (${test.model})` : ""}.` : test.reason}
            </p>
          )}
        </div>
        <Button size="sm" disabled={test === "running"} onClick={() => void run()} title="Sends one tiny request through this provider">
          {test === "running" ? "Testing…" : "Test"}
        </Button>
      </div>
    </li>
  );
}

/**
 * Which AI does System Two's occasional thinking: the subscriptions you
 * already pay for (through each provider's official CLI), an API key, or a
 * model on this machine. Whatever you pick sees the same thing — weekly
 * aggregates and your own declared words, never anything a sensor observed.
 */
export function ProvidersPanel() {
  const state = useAppState();
  const [statuses, setStatuses] = useState<ProviderStatus[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchSystemTwoStatus().then((s) => {
      if (!alive) return;
      setStatuses(s?.providers ?? null);
      setFailed(!s);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!state.hydrated) return <Panel><Skeleton lines={4} /></Panel>;
  const { model } = state;

  return (
    <Panel id="ai" title="AI for System Two" kicker="Your subscriptions, your keys, or a local model">
      <p className="max-w-3xl text-sm leading-6 text-zinc-400">
        System Two writes the weekly mirror’s paragraph and drafts proposals for your model — only when you ask, never per event.
        Whichever AI you choose receives the same thing: weekly aggregates and the words you declared. Never an event, a label, or
        anything a sensor saw. If it’s unavailable, FocusDeck uses its plain template.
      </p>
      <div className="mt-3">
        <Toggle
          checked={model.systemTwoEnabled}
          onChange={(systemTwoEnabled) => update((m) => ({ ...m, systemTwoEnabled }))}
          label="Let System Two run when I ask"
          description="Off by default. Also in Declare → Rhythm."
        />
      </div>
      {failed && <p className="mt-3 text-xs text-amber-200/90">Couldn’t check which providers are set up. Is FocusDeck’s server running?</p>}
      <div className="mt-4 space-y-5">
        {GROUPS.map((group) => (
          <section key={group.access} aria-label={group.title}>
            <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">{group.title}</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{group.note}</p>
            <ul className="mt-2 grid gap-2 lg:grid-cols-2">
              {PROVIDERS.filter((p) => p.access === group.access).map((p) => (
                <ProviderRow key={p.id} id={p.id} status={statuses?.find((s) => s.id === p.id)} selected={model.systemTwoProvider === p.id} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-4 text-xs leading-5 text-zinc-500">
        Subscriptions are used only through each provider’s own command-line tool, run by you on your own machine — the way those
        tools document scripting. Plans have usage limits, and each provider’s terms apply; BUILD-NOTES.md has the details.
      </p>
    </Panel>
  );
}
