"use client";

import type { ReactNode } from "react";
import type { ConnectorStats } from "@/lib/bridge/store";
import { connectorAppIds } from "@/lib/connectors/manifest";
import { appInfo, appLabel } from "@/lib/focus/apps";
import { connectConnector, disconnectConnector, setDesignated, type UserModel } from "@/lib/focus/model";
import type { MarketConnector } from "@/lib/client/connectors";
import { useNow } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { SitesEditor } from "@/components/declare/SitesEditor";
import { CloseIcon } from "@/components/ui/icons";
import { Button, Disclosure, Dot } from "@/components/ui/primitives";
import { CodeBlock } from "./CodeBlock";
import { connectionLine, listWords } from "./status";

const KIND_WORDS: Record<string, string> = {
  "app-switch": "You switch to it",
  notification: "A notification arrives",
  "agent-needs-input": "It’s waiting on you",
  "agent-finished": "It finished",
  "agent-resumed": "It picked up again",
};

const PLATFORM: Record<string, string> = { macos: "macOS", linux: "Linux", windows: "Windows" };

const update = (fn: (m: UserModel) => UserModel) => store.setModel(fn(store.getSnapshot().model));

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="mt-8">
      <h4 className="text-base font-semibold text-ink">{title}</h4>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/**
 * One connector, in the order you'd use it: what it does and the button to
 * add it, then how to set it up and check it, then the privacy facts and
 * the details, one click down.
 */
export function ConnectorDetail({ connector, model, stats, onClose }: { connector: MarketConnector; model: UserModel; stats?: ConnectorStats; onClose: () => void }) {
  const now = useNow();
  const added = model.connectors.includes(connector.id);
  const appIds = connectorAppIds(connector);
  const introduced = connector.apps.map((a) => a.id);
  const browserCategories = appIds.filter((id) => appInfo(id)?.group === "browser" && model.designatedApps.includes(id));
  const line = connectionLine(added, stats, now);
  const usable = connector.status !== "planned";
  const byline = connector.verified ? "By FocusDeck, verified." : `By ${connector.publisher}, from the community.`;

  return (
    <article aria-labelledby={`connector-${connector.id}`} className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`connector-${connector.id}`} className="text-2xl font-semibold tracking-tight text-ink">{connector.name}</h3>
          <p className="mt-1 text-sm leading-6 text-ink-3">
            {byline} Version {connector.version} for {listWords(connector.platforms.map((p) => PLATFORM[p] ?? p))}.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label={`Close ${connector.name}`} className="-mr-2">
          <CloseIcon />
        </Button>
      </div>

      {line && (
        <p className={`mt-3 inline-flex items-center gap-2 text-sm ${line.tone === "attention" ? "text-attention" : "text-ink-2"}`}>
          <Dot tone={line.tone} />
          {line.text}
        </p>
      )}

      <p className="mt-4 max-w-[64ch] text-base leading-7 text-ink">{connector.description}</p>
      {connector.status === "spike" && (
        <p className="mt-3 max-w-[64ch] text-sm leading-6 text-ink-2">
          <span className="font-medium text-ink">Experimental.</span> Part of how it hooks in hasn’t been tested end to end yet. Its README says which part.
        </p>
      )}
      {connector.status === "planned" && (
        <p className="mt-3 max-w-[64ch] text-sm leading-6 text-ink-2">
          <span className="font-medium text-ink">Planned.</span> There’s nothing to install yet. Its README explains what’s missing.
        </p>
      )}

      {usable && (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          {added ? (
            <Button variant="danger" onClick={() => update((m) => disconnectConnector(m, connector.id, introduced))}>Remove connector</Button>
          ) : (
            <Button variant="primary" onClick={() => update((m) => connectConnector(m, connector.id, appIds))}>Add connector</Button>
          )}
          <p className="max-w-[52ch] text-sm leading-6 text-ink-3">
            {added
              ? "FocusDeck stops noticing the apps only this connector brought. To stop it sending at all, undo the setup below."
              : "Adding it chooses the apps it reports, so FocusDeck can see them. Then follow the steps below."}
          </p>
        </div>
      )}

      {stats && (stats.dropped > 0 || stats.rejected > 0 || stats.accepted > 0) && (
        <div className="mt-4 text-sm leading-6">
          <p className="text-ink-3">
            Since FocusDeck started: {stats.accepted} accepted, {stats.dropped} dropped because the app isn’t chosen, {stats.rejected} rejected.
          </p>
          {stats.lastRejection && <p className="text-attention">Last rejection: {stats.lastRejection}</p>}
        </div>
      )}

      {connector.setup.length > 0 && (
        <Block title="Set it up">
          {connector.requirements.length > 0 && (
            <p className="max-w-[64ch] text-sm leading-6 text-ink-2">You’ll need {listWords(connector.requirements)}.</p>
          )}
          <ol className="mt-4 space-y-6">
            {connector.setup.map((step, i) => (
              <li key={step.title} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
                <span aria-hidden className="grid size-7 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-ink tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm font-medium text-ink">
                    <span className="sr-only">Step {i + 1}: </span>
                    {step.title}
                  </p>
                  {step.body && <p className="mt-1 max-w-[64ch] text-sm leading-6 whitespace-pre-line text-ink-2">{step.body}</p>}
                  {step.code && <CodeBlock code={step.code.content} label={`${step.title} (${step.code.language})`} language={step.code.language} />}
                </div>
              </li>
            ))}
          </ol>
        </Block>
      )}

      {connector.test && (
        <Block title="Check it works">
          <CodeBlock code={connector.test.command} label="Test command" language="shell" />
          <p className="mt-2 max-w-[64ch] text-sm leading-6 text-ink-2">
            <span className="font-medium text-ink">What you should see: </span>
            {connector.test.expect}
          </p>
        </Block>
      )}

      {appIds.length > 0 && usable && (
        <Block title="Apps it reports">
          <p className="max-w-[64ch] text-sm leading-6 text-ink-2">FocusDeck only sees apps you choose. The bridge drops the rest without looking at them.</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2.5">
            {appIds.map((id) => (
              <label key={id} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  className="size-4 accent-accent"
                  checked={model.designatedApps.includes(id)}
                  onChange={(e) => update((m) => setDesignated(m, id, e.target.checked))}
                />
                {appLabel(id)}
              </label>
            ))}
          </div>
        </Block>
      )}

      {browserCategories.length > 0 && (
        <Block title="Which sites count as each kind">
          <p className="mb-3 max-w-[64ch] text-sm leading-6 text-ink-2">Matched inside your browser. Only the kind, never the address, is sent.</p>
          <SitesEditor model={model} update={update} categories={browserCategories} />
        </Block>
      )}

      <div className="mt-8 space-y-1 border-t border-line pt-4">
        <Disclosure title="What it sends, and what it never sends">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-ink">Sends only these fields</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {connector.privacy.sends.map((f) => (
                  <code key={f} className="rounded-md bg-sunk px-1.5 py-0.5 text-xs text-ink ring-1 ring-line ring-inset">{f}</code>
                ))}
              </div>
              <p className="mt-2 text-sm leading-6 text-ink-3">The bridge rejects any event with another field, so this list is enforced, not promised.</p>
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Never sends</p>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-ink-2">
                {connector.privacy.neverSends.map((n) => (
                  <li key={n} className="flex gap-2">
                    <CloseIcon size={14} className="mt-1 shrink-0 text-ink-3" />
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Disclosure>

        {connector.emits.length > 0 && (
          <Disclosure title="When it speaks up" meta={`${connector.emits.length} moment${connector.emits.length === 1 ? "" : "s"}`}>
            <ul className="space-y-2 text-sm leading-6">
              {connector.emits.map((e) => (
                <li key={`${e.kind}-${e.app}-${e.when}`}>
                  <span className="font-medium text-ink">{KIND_WORDS[e.kind] ?? e.kind}</span>
                  <span className="text-ink-2"> in {appLabel(e.app)}: </span>
                  <span className="text-ink-3">{e.when}</span>
                </li>
              ))}
            </ul>
          </Disclosure>
        )}

        {connector.docs && (
          <Disclosure title="Full documentation">
            <p className="text-sm leading-6 text-ink-2">
              Everything about this connector is in <code className="break-all text-ink">{connector.docs}</code>.
            </p>
          </Disclosure>
        )}
      </div>
    </article>
  );
}
