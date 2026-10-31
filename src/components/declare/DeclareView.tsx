"use client";

import { validateModel, type UserModel } from "@/lib/focus/model";
import { useAppState } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { newId } from "@/lib/client/systemTwoClient";
import { Button, Panel, Skeleton } from "@/components/ui/primitives";
import { AppsSection } from "./AppsSection";
import { IntentionsSection } from "./IntentionsSection";
import { ModesSection } from "./ModesSection";
import { ProposalsSection } from "./ProposalsSection";
import { QueueSection } from "./QueueSection";
import { RhythmSection } from "./RhythmSection";

const SECTIONS = [
  ["apps", "Apps"],
  ["modes", "Modes"],
  ["intentions", "Intentions"],
  ["queue", "What you'd rather do"],
  ["rhythm", "Rhythm"],
  ["proposals", "Proposals"],
] as const;

/** Declare — the calm-moment step of the core loop. Every edit saves to your model at once. */
export function DeclareView() {
  const state = useAppState();
  if (!state.hydrated) return <Panel><Skeleton lines={6} /></Panel>;
  const model = state.model;
  const update = (fn: (m: UserModel) => UserModel) => store.setModel(fn(store.getSnapshot().model));
  const problems = validateModel(model);
  return (
    <div className="space-y-4">
      <nav aria-label="Declare sections" className="flex flex-wrap gap-2">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700">{label}</a>
        ))}
      </nav>
      {problems.length > 0 && (
        <Panel tone="warn" title="Worth fixing" kicker={`${problems.length} thing${problems.length === 1 ? "" : "s"} in your model don't fit together`}>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-100/90">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">FocusDeck keeps running — anything that doesn’t fit is simply ignored until it does.</p>
        </Panel>
      )}
      <AppsSection model={model} update={update} />
      <ModesSection model={model} update={update} newId={newId} />
      <IntentionsSection model={model} update={update} newId={newId} />
      <QueueSection model={model} update={update} newId={newId} />
      <RhythmSection model={model} update={update} />
      <ProposalsSection />
      <Panel title="Start over" kicker="Recoverable">
        <p className="text-sm text-zinc-400">Replace your model with the demo one, or a blank one. Your history and today’s deck stay as they are.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => window.confirm("Replace your model with the demo model?") && store.chooseModel("demo")}>Use the demo model</Button>
          <Button variant="ghost" onClick={() => window.confirm("Replace your model with a blank one?") && store.chooseModel("blank")}>Start blank</Button>
        </div>
      </Panel>
    </div>
  );
}
