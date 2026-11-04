"use client";

import type { ConnectorStats } from "@/lib/bridge/store";
import { connectorAppIds } from "@/lib/connectors/manifest";
import { appInfo, appLabel } from "@/lib/focus/apps";
import { connectConnector, disconnectConnector, setDesignated, type UserModel } from "@/lib/focus/model";
import type { MarketConnector } from "@/lib/client/connectors";
import { ago, useNow } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { SitesEditor } from "@/components/declare/SitesEditor";
import { Badge, Button, Panel } from "@/components/ui/primitives";
import { CodeBlock } from "./CodeBlock";

const KIND_WORDS: Record<string, string> = {
  "app-switch": "You switch to it",
  notification: "A notification",
  "agent-needs-input": "Waiting on you",
  "agent-finished": "Finished",
  "agent-resumed": "Picked up again",
};

export const STATUS_BADGE = {
  ready: { tone: "emerald", label: "Ready" },
  spike: { tone: "amber", label: "Spike" },
  planned: { tone: "zinc", label: "Planned" },
} as const;

const update = (fn: (m: UserModel) => UserModel) => store.setModel(fn(store.getSnapshot().model));

/** Where a connector stands, from what the bridge has counted (never what was sent). */
export function connectionLine(added: boolean, stats: ConnectorStats | undefined, now: number): { tone: "sky" | "zinc" | "amber" | "red"; text: string } | null {
  if (stats?.lastEventAt) return { tone: "sky", text: `Live · last event ${now ? ago(stats.lastEventAt, now) : "recently"}` };
  if (stats?.rejected) return { tone: "red", text: "Its events are being rejected" };
  if (stats?.dropped) return { tone: "amber", text: "Sending, but its apps aren't designated" };
  if (added) return { tone: "zinc", text: "Added · waiting for its first event" };
  return null;
}

export function ConnectorDetail({ connector, model, stats, onClose }: { connector: MarketConnector; model: UserModel; stats?: ConnectorStats; onClose: () => void }) {
  const now = useNow();
  const added = model.connectors.includes(connector.id);
  const appIds = connectorAppIds(connector);
  const introduced = connector.apps.map((a) => a.id);
  const browserCategories = appIds.filter((id) => appInfo(id)?.group === "browser" && model.designatedApps.includes(id));
  const line = connectionLine(added, stats, now);
  const status = STATUS_BADGE[connector.status];

  return (
    <Panel
      title={connector.name}
      kicker={`${connector.verified ? "FocusDeck · verified" : `${connector.publisher} · community`} · v${connector.version}`}
      actions={<Button size="sm" variant="ghost" onClick={onClose} aria-label="Close details">Close</Button>}
      tone={added ? "accent" : "default"}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status.tone}>{status.label}</Badge>
        {connector.platforms.map((p) => <Badge key={p}>{p === "macos" ? "macOS" : p === "linux" ? "Linux" : "Windows"}</Badge>)}
        {line && <Badge tone={line.tone}>{line.text}</Badge>}
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-300">{connector.description}</p>
      {connector.status === "spike" && <p className="mt-2 text-xs leading-5 text-amber-200/90">A spike: part of how it hooks in hasn’t been verified end to end yet. Its README says which part.</p>}
      {connector.status === "planned" && <p className="mt-2 text-xs leading-5 text-zinc-400">Planned: there’s nothing to install yet. The README explains what’s missing.</p>}

      {connector.status !== "planned" && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {added ? (
            <Button variant="danger" size="sm" onClick={() => update((m) => disconnectConnector(m, connector.id, introduced))}>Remove connector</Button>
          ) : (
            <Button variant="primary" size="sm" onClick={() => update((m) => connectConnector(m, connector.id, appIds))}>Add connector</Button>
          )}
          <p className="text-xs leading-5 text-zinc-500">
            {added
              ? "Removing it stops FocusDeck noticing the apps only it introduced. To stop it sending at all, undo the setup below."
              : "Adding it designates the apps below (uncheck any you’d rather FocusDeck not notice), then follow the setup."}
          </p>
        </div>
      )}

      {stats && (stats.dropped > 0 || stats.rejected > 0 || stats.accepted > 0) && (
        <div className="mt-4 rounded-xl bg-zinc-950/60 p-3 text-xs leading-5 text-zinc-400">
          Since FocusDeck started: {stats.accepted} accepted · {stats.dropped} dropped (app not designated) · {stats.rejected} rejected
          {stats.lastRejection && <span className="mt-1 block text-red-300">Last rejection: {stats.lastRejection}</span>}
        </div>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section aria-label="What it sends">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">What it sends</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {connector.privacy.sends.map((f) => <code key={f} className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-emerald-300">{f}</code>)}
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-500">The bridge rejects any event with another field, so this list is enforced, not promised.</p>
        </section>
        <section aria-label="What it never sends">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">What it never sends</h3>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-zinc-300">
            {connector.privacy.neverSends.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </section>
      </div>

      {connector.emits.length > 0 && (
        <section className="mt-5" aria-label="When it speaks up">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">When it speaks up</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {connector.emits.map((e) => (
              <li key={`${e.kind}-${e.app}-${e.when}`} className="flex flex-wrap items-baseline gap-2">
                <Badge tone="violet">{KIND_WORDS[e.kind] ?? e.kind}</Badge>
                <span className="text-zinc-300">{appLabel(e.app)}</span>
                <span className="text-xs text-zinc-500">{e.when}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {appIds.length > 0 && connector.status !== "planned" && (
        <section className="mt-5" aria-label="Apps it reports">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Apps it reports</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-500">FocusDeck only sees designated apps; the bridge drops the rest unseen.</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {appIds.map((id) => (
              <label key={id} className="flex items-center gap-2 text-sm text-zinc-200">
                <input type="checkbox" className="h-4 w-4 accent-emerald-400" checked={model.designatedApps.includes(id)} onChange={(e) => update((m) => setDesignated(m, id, e.target.checked))} />
                {appLabel(id)}
              </label>
            ))}
          </div>
        </section>
      )}

      {browserCategories.length > 0 && (
        <section className="mt-5" aria-label="Sites">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Which sites count as each category</h3>
          <p className="mt-1 mb-2 text-xs leading-5 text-zinc-500">Matched inside your browser; only the category is ever sent.</p>
          <SitesEditor model={model} update={update} categories={browserCategories} />
        </section>
      )}

      {connector.requirements.length > 0 && (
        <p className="mt-5 text-xs text-zinc-400"><span className="font-semibold tracking-wide text-zinc-400 uppercase">Needs</span> · {connector.requirements.join(" · ")}</p>
      )}

      {connector.setup.length > 0 && (
        <section className="mt-5" aria-label="Set it up">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Set it up</h3>
          <ol className="mt-2 space-y-4">
            {connector.setup.map((step, i) => (
              <li key={step.title} className="text-sm">
                <p className="font-medium text-zinc-200"><span className="mr-2 text-zinc-500 tabular-nums">{i + 1}.</span>{step.title}</p>
                {step.body && <p className="mt-1 text-xs leading-5 whitespace-pre-line text-zinc-400">{step.body}</p>}
                {step.code && <CodeBlock code={step.code.content} label={`${step.title} (${step.code.language})`} language={step.code.language} />}
              </li>
            ))}
          </ol>
        </section>
      )}

      {connector.test && (
        <section className="mt-5" aria-label="Check it works">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Check it works</h3>
          <CodeBlock code={connector.test.command} label="Test command" language="shell" />
          <p className="mt-1.5 text-xs leading-5 text-zinc-400">Then expect: {connector.test.expect}</p>
        </section>
      )}

      {connector.docs && <p className="mt-5 text-xs text-zinc-500">Full details: <code className="break-all text-zinc-300">{connector.docs}</code></p>}
    </Panel>
  );
}
