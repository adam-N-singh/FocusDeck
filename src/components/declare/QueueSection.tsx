"use client";

import { useState } from "react";
import { appLabel } from "@/lib/focus/apps";
import type { UserModel } from "@/lib/focus/model";
import type { QueueItem, QueueItemKind } from "@/lib/focus/offer";
import type { AppId } from "@/lib/focus/types";
import { Button, Panel, inputClass } from "@/components/ui/primitives";

const KINDS: { kind: Exclude<QueueItemKind, "blocked-agent">; label: string }[] = [
  { kind: "task", label: "Task" },
  { kind: "intention", label: "Pinned intention" },
  { kind: "content-chunk", label: "Something short to read" },
  { kind: "interest", label: "Declared interest" },
];
const selectClass = "rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100";

type Draft = Omit<QueueItem, "id">;
const EMPTY: Draft = { kind: "task", title: "", microAction: "", priority: 2, estimatedMinutes: 5 };

function ItemFields({ item, designated, onChange }: { item: Draft; designated: AppId[]; onChange: (d: Draft) => void }) {
  return (
    <div className="grid gap-2 md:grid-cols-6">
      <input aria-label="What" placeholder="What, e.g. Review PR #42" value={item.title} onChange={(e) => onChange({ ...item, title: e.target.value })} className={`${inputClass} md:col-span-2`} />
      <input aria-label="Smallest next step" placeholder="Smallest next step, e.g. Open the PR" value={item.microAction} onChange={(e) => onChange({ ...item, microAction: e.target.value })} className={`${inputClass} md:col-span-2`} />
      <input aria-label="Link to pre-load" placeholder="https://… (optional)" value={item.url ?? ""} onChange={(e) => onChange({ ...item, url: e.target.value || undefined })} className={`${inputClass} md:col-span-2`} />
      <div className="flex flex-wrap items-center gap-2 md:col-span-6">
        <select aria-label="Kind" className={selectClass} value={item.kind} onChange={(e) => onChange({ ...item, kind: e.target.value as Draft["kind"] })}>
          {KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
        </select>
        <select aria-label="Where it happens" className={selectClass} value={item.app ?? ""} onChange={(e) => onChange({ ...item, app: (e.target.value || undefined) as AppId | undefined })}>
          <option value="">happens anywhere</option>
          {designated.map((app) => <option key={app} value={app}>happens in {appLabel(app)}</option>)}
        </select>
        <label className="text-xs text-zinc-400">
          Priority
          <select aria-label="Priority" className={`${selectClass} ml-1`} value={item.priority} onChange={(e) => onChange({ ...item, priority: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          ~
          <input aria-label="Minutes" type="number" min={1} max={120} value={item.estimatedMinutes} onChange={(e) => onChange({ ...item, estimatedMinutes: Math.max(1, Number(e.target.value) || 1) })} className="w-16 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100" />
          {" "}min
        </label>
      </div>
    </div>
  );
}

/**
 * What you'd rather do — the only things FocusDeck may offer (not a feed:
 * every offer traces to this list or to an agent waiting on you). Offers come
 * in Hymah's order: blocked agents, tasks, pinned intentions, short reads,
 * declared interests.
 */
export function QueueSection({ model, update, newId }: { model: UserModel; update: (fn: (m: UserModel) => UserModel) => void; newId: (prefix: string) => string }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const set = (id: string, next: Draft) => update((m) => ({ ...m, queue: m.queue.map((q) => (q.id === id ? { ...next, id } : q)) }));
  const add = () => {
    update((m) => ({ ...m, queue: [...m.queue, { ...draft, title: draft.title.trim(), microAction: draft.microAction.trim(), id: newId("q") }] }));
    setDraft(EMPTY);
  };
  return (
    <Panel id="queue" title="What you'd rather do" kicker="Everything FocusDeck may offer">
      <p className="text-sm leading-6 text-zinc-400">
        Keep each next step small (“Open the PR”, not “Do the review”). Saying where it happens lets FocusDeck prefer offers that keep
        you in your mode, so taking one isn’t itself a context switch.
      </p>
      <div className="mt-3 space-y-3">
        {model.queue.map((item) => (
          <div key={item.id} className="space-y-2 rounded-xl bg-zinc-950/60 p-4">
            <ItemFields item={item} designated={model.designatedApps} onChange={(next) => set(item.id, next)} />
            <div className="text-right">
              <Button size="sm" variant="danger" onClick={() => update((m) => ({ ...m, queue: m.queue.filter((q) => q.id !== item.id) }))}>Remove</Button>
            </div>
          </div>
        ))}
        <div className="space-y-2 rounded-xl border border-dashed border-zinc-700 p-4">
          <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Add something</p>
          <ItemFields item={draft} designated={model.designatedApps} onChange={setDraft} />
          <Button variant="primary" disabled={!draft.title.trim() || !draft.microAction.trim()} onClick={add}>Add to my list</Button>
        </div>
      </div>
    </Panel>
  );
}
