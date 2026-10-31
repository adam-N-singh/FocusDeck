"use client";

import { useMemo, useState } from "react";
import { appLabel } from "@/lib/focus/apps";
import { deriveHypotheses } from "@/lib/focus/learn";
import { buildMirror } from "@/lib/focus/mirror";
import { buildSynthesisPayload } from "@/lib/systemTwo/payload";
import { useAppState } from "@/lib/client/hooks";
import { storedBytes } from "@/lib/client/persist";
import { store } from "@/lib/client/store";
import { Badge, Button, Panel, Skeleton } from "@/components/ui/primitives";

const COLLECTED = [
  ["kind", "app-switch, notification, agent-needs-input, agent-finished", "Which kind of moment it was"],
  ["app", "editor, slack, claude-code…", "Which designated app — never what it showed"],
  ["time", "09:42", "Minutes since midnight, for ageing and the rolling hour"],
  ["mode", "building", "Stamped by FocusDeck from your own dock, not observed"],
  ["source", "eaabdaa5d330d5d2", "Agents only: an opaque hash of a session id, so loops close per session"],
];

const NEVER = [
  "Screen contents or screenshots", "Window titles", "URLs or page titles", "Keystrokes",
  "Notification or message text", "What you type into an agent", "File names, paths or transcripts", "Anything from an app you haven't designated",
];

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * What FocusDeck Sees (Hymah Privacy §4, ASSESSMENT.md §4.7): everything it
 * knows, where it lives, what it never collects, and what it has inferred —
 * visible, deletable, and inactionable until you confirm it.
 */
export function SeesView() {
  const state = useAppState();
  const { model, live, history, bridge } = state;
  const [showPayload, setShowPayload] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const pending = useMemo(() => deriveHypotheses({ model, deck: live, history }), [model, live, history]);
  if (!state.hydrated) return <Panel><Skeleton lines={6} /></Panel>;

  const recent = live.events.slice(-5).reverse();
  const forget = (kind: "inferences" | "questions", id: string) =>
    store.setModel(kind === "inferences" ? { ...model, inferences: model.inferences.filter((r) => r.id !== id) } : { ...model, questions: model.questions.filter((q) => q.questionId !== id) });
  const importFile = async (file: File | undefined) => setImportError(file ? store.importData(await file.text()) : null);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel kicker="Observed metadata" title="What it collects">
          <p className="text-sm text-zinc-400">
            From {model.designatedApps.length === 0 ? "no apps — nothing is designated yet" : model.designatedApps.map(appLabel).join(", ")}. Each moment is these fields, and only these:
          </p>
          <table className="mt-3 w-full text-left text-sm">
            <tbody>
              {COLLECTED.map(([field, example, why]) => (
                <tr key={field} className="border-t border-zinc-800 align-top">
                  <td className="py-2 pr-3 font-mono text-xs text-emerald-300">{field}</td>
                  <td className="py-2 pr-3 text-xs text-zinc-300">{example}</td>
                  <td className="py-2 text-xs text-zinc-500">{why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel kicker="Never collected (Hymah's Class E)" title="What it never sees">
          <ul className="grid gap-1.5 text-sm text-zinc-300 sm:grid-cols-2">
            {NEVER.map((n) => <li key={n}><span aria-hidden className="text-red-300">✕ </span>{n}</li>)}
          </ul>
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            Structural, not a promise: a sensor may send kind, app, source and time — nothing else. The bridge rejects any event
            carrying another field{bridge.stats ? ` (${bridge.stats.rejected} rejected so far)` : ""}, and sensors drop undesignated apps before sending
            {bridge.stats ? ` (${bridge.stats.dropped} dropped at the bridge as a second check)` : ""}.
          </p>
        </Panel>
      </div>

      <Panel kicker="Inferences (Hymah's Class D)" title="What it has inferred">
        <p className="text-sm text-zinc-400">Inferences change nothing until you confirm them, and you can forget any of them.</p>
        <ul className="mt-3 space-y-2 text-sm">
          {pending.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2">
              <Badge tone="sky">waiting for you</Badge><span className="text-zinc-200">{h.statement}</span>
              <span className="text-xs text-zinc-500">{h.evidence}</span>
            </li>
          ))}
          {model.inferences.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <Badge tone={r.status === "confirmed" ? "emerald" : "zinc"}>{r.status} {r.decidedOn}</Badge>
              <span className="text-zinc-300">{r.statement}</span>
              <Button size="sm" variant="ghost" onClick={() => forget("inferences", r.id)}>Forget</Button>
            </li>
          ))}
          {model.questions.map((q) => (
            <li key={`${q.questionId}-${q.askedOn}`} className="flex flex-wrap items-center gap-2">
              <Badge>answered {q.askedOn}</Badge>
              <span className="text-zinc-300">Question “{q.questionId}”: {q.answer}</span>
              <Button size="sm" variant="ghost" onClick={() => forget("questions", q.questionId)}>Forget</Button>
            </li>
          ))}
          {pending.length + model.inferences.length + model.questions.length === 0 && <li className="text-zinc-500">Nothing inferred yet.</li>}
        </ul>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel kicker="Local-first" title="Where it lives">
          <ul className="space-y-2 text-sm text-zinc-300">
            <li>This browser’s storage: about {Math.max(1, Math.round(storedBytes() / 1024))} KB — your model, today, and {history.length} archived day{history.length === 1 ? "" : "s"}.</li>
            <li>The sensor bridge on this machine: an in-memory buffer of recent events, gone when the server stops.</li>
            <li>
              Nothing leaves this machine{model.systemTwoEnabled ? " except, on demand, what System Two receives:" : " — System Two is off."}{" "}
              {model.systemTwoEnabled && <button type="button" className="text-emerald-300 underline underline-offset-2" onClick={() => setShowPayload((v) => !v)}>{showPayload ? "hide it" : "show exactly what"}</button>}
            </li>
          </ul>
          {showPayload && (
            <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-zinc-950 p-3 text-xs text-zinc-300">
              {JSON.stringify(buildSynthesisPayload(buildMirror(history, live.day, { reviewEveryMinutes: model.reviewEveryMinutes, openLoopsNow: 0, activeIntentions: 0, trapApps: 0, pendingProposals: 0 }), model.intentions.filter((i) => i.enabled).map((i) => i.text)), null, 2)}
            </pre>
          )}
        </Panel>
        <Panel kicker="Exactly as stored" title="Your last five moments">
          {recent.length === 0 ? <p className="text-sm text-zinc-400">Nothing yet today.</p> : (
            <pre className="max-h-64 overflow-auto rounded-xl bg-zinc-950 p-3 text-xs text-zinc-300">{JSON.stringify(recent, null, 2)}</pre>
          )}
          <p className="mt-2 text-xs text-zinc-500">Labels are written by FocusDeck from the kind and app — never taken from the app itself.</p>
        </Panel>
      </div>

      <Panel kicker="Yours to take or erase" title="Controls">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => store.dispatch({ type: "toggle-pause", at: store.now() })}>{(state.demo?.deck ?? live).paused ? "Resume guarding" : "Pause guarding"}</Button>
          <Button onClick={() => download(`focusdeck-${live.day}.json`, store.exportData())}>Export everything (JSON)</Button>
          <label className="cursor-pointer rounded-full bg-zinc-800 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-700">
            Import a model…
            <input type="file" accept="application/json" className="sr-only" onChange={(e) => void importFile(e.target.files?.[0])} />
          </label>
          <Button variant="danger" onClick={() => window.confirm("Delete your model, today, and all history from this browser? This can't be undone.") && store.deleteEverything()}>
            Delete everything
          </Button>
        </div>
        {importError && <p className="mt-2 text-sm text-red-300">{importError}</p>}
      </Panel>
    </div>
  );
}
