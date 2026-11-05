"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { appLabel } from "@/lib/focus/apps";
import { deriveHypotheses } from "@/lib/focus/learn";
import { buildMirror } from "@/lib/focus/mirror";
import { buildSynthesisPayload } from "@/lib/systemTwo/payload";
import { providerInfo } from "@/lib/systemTwo/providerCatalog";
import { useAppState } from "@/lib/client/hooks";
import { storedBytes } from "@/lib/client/persist";
import { store } from "@/lib/client/store";
import { CloseIcon, PauseIcon, PlayIcon } from "@/components/ui/icons";
import { Button, Disclosure, Section, Skeleton } from "@/components/ui/primitives";

const FIELDS = [
  ["kind", "app-switch, notification, agent-needs-input, agent-finished", "Which kind of moment it was"],
  ["app", "editor, slack, claude-code", "Which app you chose, never what it showed"],
  ["time", "09:42", "Minutes since midnight, to age what’s waiting and count the last hour"],
  ["mode", "building", "Stamped by FocusDeck from your own mode switcher, not observed"],
  ["source", "eaabdaa5d330d5d2", "Agents only: a scrambled session id, so each agent’s entry closes on its own"],
  ["via", "claude-code", "Which connector reported it, so Connect can show whether each one works"],
];

const NEVER = [
  "Your screen, or screenshots of it",
  "Window titles",
  "Web addresses or page titles",
  "Keystrokes",
  "What a message or notification said",
  "What you type to an agent",
  "File names, paths or transcripts",
  "Anything from an app you didn’t choose",
];

const QUESTION_WORDS: Record<string, string> = {
  "faster-review": "A review every 30 minutes",
  "quiet-first-build-hour": "Staying quiet in your first build hour",
};

const ANSWER_WORDS = { yes: "Yes", no: "No", skipped: "Not now" } as const;

const shortDate = (day: string) => {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : date.toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" });
};

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

function Fact({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="min-w-0 p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-6 text-ink-2">{children}</div>
    </section>
  );
}

function Row({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3.5 pr-3 pl-4">
      <div className="min-w-0 flex-1 basis-64">{children}</div>
      {action}
    </li>
  );
}

/**
 * Privacy: everything FocusDeck notices, what it never sees, where it keeps
 * it, what it has worked out — visible, forgettable, and inactionable until
 * you confirm — and the controls to take all of it or erase it.
 */
export function SeesView() {
  const state = useAppState();
  const { model, live, history, bridge } = state;
  const [showPayload, setShowPayload] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const pending = useMemo(() => deriveHypotheses({ model, deck: live, history }), [model, live, history]);
  if (!state.hydrated) return <Skeleton lines={8} />;

  const recent = live.events.slice(-5).reverse();
  const paused = (state.demo?.deck ?? live).paused;
  const provider = providerInfo(model.systemTwoProvider);
  const kb = Math.max(1, Math.round(storedBytes() / 1024));
  const forget = (kind: "inferences" | "questions", id: string) =>
    store.setModel(
      kind === "inferences"
        ? { ...model, inferences: model.inferences.filter((r) => r.id !== id) }
        : { ...model, questions: model.questions.filter((q) => q.questionId !== id) },
    );
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const error = store.importData(await file.text());
    setImportError(error);
    setImported(!error);
  };
  const workedOut = pending.length + model.inferences.length + model.questions.length;

  return (
    <div className="space-y-12">
      <div className="grid divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface md:grid-cols-3 md:divide-x md:divide-y-0">
        <Fact title="What it notices">
          <p>Which app you switched to, when, and what kind of moment it was: a switch, a notification, an agent finishing or waiting on you.</p>
          <p>
            {model.designatedApps.length === 0 ? (
              <>From no apps yet. Nothing is chosen, so it notices nothing.</>
            ) : (
              <>
                Only from apps you chose: <span className="text-ink">{model.designatedApps.map(appLabel).join(", ")}</span>.
              </>
            )}{" "}
            <Link href="/declare#apps" className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent">
              Change in Setup
            </Link>
          </p>
        </Fact>

        <Fact title="What it never sees">
          <ul className="space-y-1">
            {NEVER.map((n) => (
              <li key={n} className="flex gap-2">
                <CloseIcon size={14} className="mt-[5px] shrink-0 text-ink-3" />
                {n}
              </li>
            ))}
          </ul>
          <p className="text-ink-3">
            The browser connector checks your site lists inside the browser and sends only the kind of site, never the address.
          </p>
        </Fact>

        <Fact title="Where it lives">
          <p>
            In this browser: about {kb} KB, holding your setup, today, and {history.length} earlier day{history.length === 1 ? "" : "s"}.
          </p>
          <p>On the bridge on this machine: a short list of recent events in memory, gone when the server stops.</p>
          {model.systemTwoEnabled ? (
            <p>
              Nothing leaves this machine except, when you ask, what the AI helper receives through {provider.label}. It goes to{" "}
              {provider.destination.replace(/\.$/, "")}.{" "}
              <button
                type="button"
                aria-expanded={showPayload}
                className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent"
                onClick={() => setShowPayload((v) => !v)}
              >
                {showPayload ? "Hide it" : "Show exactly what"}
              </button>
            </p>
          ) : (
            <p className="text-ink">Nothing leaves this machine. The AI helper is off.</p>
          )}
        </Fact>
      </div>

      {showPayload && model.systemTwoEnabled && (
        <section aria-label="What the AI helper receives">
          <p className="mb-2 text-sm text-ink-2">This is the whole message the AI helper would receive right now.</p>
          <pre className="max-h-80 overflow-auto rounded-xl border border-line bg-sunk p-4 text-xs leading-5 text-ink">
            {JSON.stringify(
              buildSynthesisPayload(
                buildMirror(history, live.day, { reviewEveryMinutes: model.reviewEveryMinutes, openLoopsNow: 0, activeIntentions: 0, trapApps: 0, pendingProposals: 0 }),
                model.intentions.filter((i) => i.enabled).map((i) => i.text),
              ),
              null,
              2,
            )}
          </pre>
        </section>
      )}

      <div className="space-y-1">
        <Disclosure title="The exact fields" meta="every moment is these and nothing else">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="text-ink-3">
                  <th scope="col" className="py-2 pr-4 font-normal">Field</th>
                  <th scope="col" className="py-2 pr-4 font-normal">For example</th>
                  <th scope="col" className="py-2 font-normal">Why</th>
                </tr>
              </thead>
              <tbody>
                {FIELDS.map(([field, example, why]) => (
                  <tr key={field} className="border-t border-line align-top">
                    <td className="py-2.5 pr-4"><code className="text-ink">{field}</code></td>
                    <td className="py-2.5 pr-4 text-ink-2">{example}</td>
                    <td className="py-2.5 text-ink-2">{why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 max-w-[68ch] text-sm leading-6 text-ink-3">
            This is enforced, not promised. The bridge rejects any event carrying another field
            {bridge.stats ? ` (${bridge.stats.rejected} so far)` : ""}, and connectors drop apps you didn’t choose before sending
            {bridge.stats ? `; the bridge has dropped ${bridge.stats.dropped} more as a second check` : ""}.
          </p>
        </Disclosure>

        <Disclosure title="Your last five moments, exactly as stored" meta={recent.length === 0 ? "none yet today" : undefined}>
          {recent.length === 0 ? (
            <p className="text-sm text-ink-2">Nothing yet today.</p>
          ) : (
            <pre className="max-h-80 overflow-auto rounded-xl border border-line bg-sunk p-4 text-xs leading-5 text-ink">{JSON.stringify(recent, null, 2)}</pre>
          )}
          <p className="mt-2 max-w-[68ch] text-sm leading-6 text-ink-3">The labels are written by FocusDeck from the kind and the app, never taken from the app itself.</p>
        </Disclosure>
      </div>

      <Section
        title="What it has worked out"
        description="Patterns FocusDeck noticed in your days, and your answers to its questions. None of them change anything until you confirm, and you can forget any of them."
      >
        {workedOut === 0 ? (
          <p className="text-sm text-ink-2">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface" aria-label="What it has worked out">
            {pending.map((h) => (
              <Row
                key={h.id}
                action={
                  <Link href="/declare#proposals" className="inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium text-ink-2 hover:bg-sunk hover:text-ink">
                    Decide in Setup
                  </Link>
                }
              >
                <p className="text-sm text-ink">{h.statement}</p>
                <p className="text-xs leading-5 text-ink-3">Waiting for you to confirm. {h.evidence}</p>
              </Row>
            ))}
            {model.inferences.map((r) => (
              <Row key={r.id} action={<Button size="sm" variant="ghost" onClick={() => forget("inferences", r.id)}>Forget</Button>}>
                <p className="text-sm text-ink">{r.statement}</p>
                <p className="text-xs leading-5 text-ink-3">
                  {r.status === "confirmed" ? "You confirmed this" : "You turned this down"} on {shortDate(r.decidedOn)}.
                </p>
              </Row>
            ))}
            {model.questions.map((q) => (
              <Row key={`${q.questionId}-${q.askedOn}`} action={<Button size="sm" variant="ghost" onClick={() => forget("questions", q.questionId)}>Forget</Button>}>
                <p className="text-sm text-ink">{QUESTION_WORDS[q.questionId] ?? q.questionId}</p>
                <p className="text-xs leading-5 text-ink-3">
                  You answered {ANSWER_WORDS[q.answer]} on {shortDate(q.askedOn)}.
                </p>
              </Row>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Your data" description="Pause FocusDeck, take a copy of everything it knows, bring a setup back, or erase it all from this browser.">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => store.dispatch({ type: "toggle-pause", at: store.now() })}>
            {paused ? <PlayIcon /> : <PauseIcon />}
            {paused ? "Resume FocusDeck" : "Pause FocusDeck"}
          </Button>
          <Button onClick={() => download(`focusdeck-${live.day}.json`, store.exportData())}>Export everything (JSON)</Button>
          <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl bg-ink/[0.045] px-4 text-sm font-medium text-ink ring-1 ring-line ring-inset transition-colors hover:bg-ink/[0.08] hover:ring-line-strong has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
            Import a setup…
            <input
              type="file"
              accept="application/json"
              className="sr-only"
              onChange={(e) => {
                void importFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <Button
            variant="danger"
            className="sm:ml-auto"
            onClick={() => window.confirm("Delete your setup, today, and all history from this browser? This can’t be undone.") && store.deleteEverything()}
          >
            Delete everything
          </Button>
        </div>
        <div aria-live="polite">
          {importError && <p className="mt-3 text-sm text-attention">{importError}</p>}
          {imported && !importError && <p className="mt-3 text-sm text-ink-2">Imported. Your setup and history are back; today starts fresh.</p>}
        </div>
      </Section>
    </div>
  );
}
