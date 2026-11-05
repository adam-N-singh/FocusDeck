"use client";

import { useEffect, useState } from "react";
import { PROVIDERS, type ProviderAccess, type ProviderId } from "@/lib/systemTwo/providerCatalog";
import type { UserModel } from "@/lib/focus/model";
import { useAppState } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { fetchSystemTwoStatus, testProvider, type ProviderStatus, type ProviderTestResult } from "@/lib/client/systemTwoClient";
import { Button, Dot, Section, Skeleton, Toggle } from "@/components/ui/primitives";

const GROUPS: { access: ProviderAccess; title: string; note: string }[] = [
  {
    access: "subscription",
    title: "Your subscriptions",
    note: "Runs the provider’s own command-line tool on this machine, signed in as you. FocusDeck never sees or stores your login.",
  },
  {
    access: "api-key",
    title: "API keys",
    note: "Keys stay in the server’s environment and never reach this page. API use is billed separately from a chat subscription.",
  },
  { access: "local", title: "On this machine", note: "Nothing leaves your computer." },
];

const update = (fn: (m: UserModel) => UserModel) => store.setModel(fn(store.getSnapshot().model));

function ProviderRow({ id, status, statusKnown, selected }: { id: ProviderId; status?: ProviderStatus; statusKnown: boolean; selected: boolean }) {
  const info = PROVIDERS.find((p) => p.id === id)!;
  const [test, setTest] = useState<ProviderTestResult | "running" | null>(null);
  const inputId = `provider-${id}`;
  const run = async () => {
    setTest("running");
    setTest((await testProvider(id)) ?? { ok: false, reason: "FocusDeck’s server didn’t answer.", ms: 0 });
  };
  const readiness = status ? (status.ready ? "Set up" : "Not set up") : statusKnown ? "Unknown" : "Checking";

  return (
    <li className={`flex items-start gap-3 py-4 pr-3 pl-4 transition-colors ${selected ? "bg-accent-soft/50" : ""}`}>
      <input
        id={inputId}
        type="radio"
        name="system-two-provider"
        className="mt-1 size-4 shrink-0 accent-accent"
        checked={selected}
        onChange={() => update((m) => ({ ...m, systemTwoProvider: id }))}
      />
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="block cursor-pointer text-sm font-medium text-ink">{info.label}</label>
        <p className={`mt-1 inline-flex items-center gap-2 text-xs ${status?.ready ? "text-ink-2" : "text-ink-3"}`}>
          <Dot tone={status?.ready ? "accent" : "muted"} />
          {readiness}
          {status?.model ? `, using ${status.model}` : ""}
        </p>
        {status?.detail && <p className="mt-1 max-w-[62ch] text-sm leading-6 text-ink-2">{status.detail}</p>}
        <dl className="mt-2 grid max-w-[62ch] grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs leading-5">
          <dt className="text-ink-3">Paid with</dt>
          <dd className="text-ink-2">{info.billing}</dd>
          <dt className="text-ink-3">Goes to</dt>
          <dd className="text-ink-2">{info.destination}</dd>
        </dl>
        {info.env.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-1">
            {info.env.map((name) => (
              <code key={name} className="rounded-md bg-sunk px-1.5 py-0.5 text-[11px] text-ink-2 ring-1 ring-line ring-inset">{name}</code>
            ))}
          </p>
        )}
        {test && test !== "running" && (
          <p className={`mt-2 max-w-[62ch] text-sm leading-6 ${test.ok ? "text-ink" : "text-attention"}`} aria-live="polite">
            {test.ok ? `It answered “${test.text}” in ${(test.ms / 1000).toFixed(1)} s${test.model ? `, using ${test.model}` : ""}.` : test.reason}
          </p>
        )}
      </div>
      <Button size="sm" disabled={test === "running"} onClick={() => void run()} title="Sends one tiny request through this provider">
        {test === "running" ? "Testing…" : "Test"}
      </Button>
    </li>
  );
}

/**
 * Which AI does the AI helper's occasional writing: the subscriptions you
 * already pay for (through each provider's official CLI), an API key, or a
 * model on this machine. Whatever you pick sees the same thing — weekly
 * totals and your own declared words, never anything a sensor observed.
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

  return (
    <Section
      id="ai"
      title="AI helper"
      description="The AI helper (System Two) writes your week’s paragraph and drafts suggestions for your setup, only when you ask. Whichever AI you pick receives the same thing: weekly totals and the words you wrote. Never an event, a label, or anything a sensor saw."
    >
      {!state.hydrated ? (
        <Skeleton lines={4} />
      ) : (
        <>
          <Toggle
            checked={state.model.systemTwoEnabled}
            onChange={(systemTwoEnabled) => update((m) => ({ ...m, systemTwoEnabled }))}
            label="Let the AI helper run when I ask"
            description="Off by default. Without it, FocusDeck writes a plain template instead. The same switch is in Setup."
          />
          {failed && <p className="mt-4 text-sm text-attention">Couldn’t check which providers are set up. Is FocusDeck’s server running?</p>}
          <div className="mt-8 space-y-8">
            {GROUPS.map((group) => (
              <section key={group.access} aria-labelledby={`providers-${group.access}`}>
                <h3 id={`providers-${group.access}`} className="text-base font-semibold text-ink">{group.title}</h3>
                <p className="mt-1 max-w-[64ch] text-sm leading-6 text-ink-2">{group.note}</p>
                <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface" aria-label={group.title}>
                  {PROVIDERS.filter((p) => p.access === group.access).map((p) => (
                    <ProviderRow
                      key={p.id}
                      id={p.id}
                      status={statuses?.find((s) => s.id === p.id)}
                      statusKnown={statuses !== null || failed}
                      selected={state.model.systemTwoProvider === p.id}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <p className="mt-6 max-w-[68ch] text-sm leading-6 text-ink-3">
            Subscriptions are used only through each provider’s own command-line tool, run by you on your own machine, the way those tools
            document scripting. Plans have usage limits and each provider’s terms apply; BUILD-NOTES.md has the details.
          </p>
        </>
      )}
    </Section>
  );
}
