"use client";

import { useState } from "react";
import { appLabel } from "@/lib/focus/apps";
import type { UserModel } from "@/lib/focus/model";
import type { QueueItem, QueueItemKind } from "@/lib/focus/offer";
import type { AppId } from "@/lib/focus/types";
import { PlusIcon } from "@/components/ui/icons";
import { Button, Group, Section, inputClass, selectClass } from "@/components/ui/primitives";
import { Field, type Update } from "./controls";

const KINDS: { kind: Exclude<QueueItemKind, "blocked-agent">; label: string }[] = [
  { kind: "task", label: "A task" },
  { kind: "intention", label: "Something I pinned" },
  { kind: "content-chunk", label: "Something short to read" },
  { kind: "interest", label: "An interest" },
];

type Draft = Omit<QueueItem, "id">;
const EMPTY: Draft = { kind: "task", title: "", microAction: "", priority: 2, estimatedMinutes: 5 };

function ItemFields({ item, designated, onChange }: { item: Draft; designated: AppId[]; onChange: (d: Draft) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="What">
          <input placeholder="Review PR #42" value={item.title} onChange={(e) => onChange({ ...item, title: e.target.value })} className={`${inputClass} voice text-base`} />
        </Field>
        <Field label="Smallest next step" hint="This is the button FocusDeck shows you.">
          <input placeholder="Open the PR" value={item.microAction} onChange={(e) => onChange({ ...item, microAction: e.target.value })} className={`${inputClass} voice text-base`} />
        </Field>
      </div>
      <Field label="Link to open, if there is one">
        <input type="url" placeholder="https://" value={item.url ?? ""} onChange={(e) => onChange({ ...item, url: e.target.value || undefined })} className={inputClass} />
      </Field>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <Field label="Kind">
          <select className={selectClass} value={item.kind} onChange={(e) => onChange({ ...item, kind: e.target.value as Draft["kind"] })}>
            {KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>{k.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Where it happens">
          <select className={selectClass} value={item.app ?? ""} onChange={(e) => onChange({ ...item, app: (e.target.value || undefined) as AppId | undefined })}>
            <option value="">Anywhere</option>
            {designated.map((app) => (
              <option key={app} value={app}>In {appLabel(app)}</option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select className={selectClass} value={item.priority} onChange={(e) => onChange({ ...item, priority: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((p) => (
              <option key={p} value={p}>{p === 1 ? "1, first" : p === 5 ? "5, last" : p}</option>
            ))}
          </select>
        </Field>
        <Field label="Minutes, roughly">
          <input
            type="number"
            min={1}
            max={120}
            value={item.estimatedMinutes}
            onChange={(e) => onChange({ ...item, estimatedMinutes: Math.max(1, Number(e.target.value) || 1) })}
            className={`${selectClass} w-20`}
          />
        </Field>
      </div>
    </div>
  );
}

/**
 * What you'd rather do: the only things FocusDeck may offer. Not a feed —
 * every offer traces to this list or to an agent waiting on you.
 */
export function QueueSection({ model, update, newId }: { model: UserModel; update: Update; newId: (prefix: string) => string }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const empty = model.queue.length === 0;
  const set = (id: string, next: Draft) => update((m) => ({ ...m, queue: m.queue.map((q) => (q.id === id ? { ...next, id } : q)) }));
  const add = () => {
    update((m) => ({ ...m, queue: [...m.queue, { ...draft, title: draft.title.trim(), microAction: draft.microAction.trim(), id: newId("q") }] }));
    setDraft(EMPTY);
    setAdding(false);
  };
  const remove = (id: string) => {
    update((m) => ({ ...m, queue: m.queue.filter((q) => q.id !== id) }));
    if (editingId === id) setEditingId(null);
  };

  return (
    <Section
      title="Things you’d rather do"
      description="The only things FocusDeck will ever offer you. Keep each next step small: “Open the PR”, not “Do the review”. Saying where it happens keeps the offer inside your mode."
    >
      {!empty && (
        <Group label="Things you’d rather do">
          {model.queue.map((item) => {
            const editing = editingId === item.id;
            return (
              <li key={item.id} className="px-4 py-3.5 sm:px-5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="voice text-base leading-7 text-ink">{item.title || "Untitled"}</p>
                    <p className="text-sm leading-6 text-ink-2">
                      <span className="voice">{item.microAction || "No next step yet"}</span>
                      <span className="text-ink-3">
                        , about {item.estimatedMinutes} min{item.app ? `, in ${appLabel(item.app)}` : ""}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    <Button size="sm" variant="ghost" aria-expanded={editing} onClick={() => setEditingId(editing ? null : item.id)}>
                      {editing ? "Done" : "Edit"}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(item.id)} aria-label={`Remove ${item.title}`}>
                      Remove
                    </Button>
                  </div>
                </div>
                {editing && (
                  <div className="mt-4 border-t border-line pt-4">
                    <ItemFields item={item} designated={model.designatedApps} onChange={(next) => set(item.id, next)} />
                  </div>
                )}
              </li>
            );
          })}
        </Group>
      )}

      <div className={empty ? "" : "mt-3"}>
        {empty || adding ? (
          <div className="space-y-4 rounded-2xl border border-dashed border-line-strong p-4 sm:p-5">
            <h3 className="text-base font-semibold text-ink">{empty ? "Add the first thing you’d rather do" : "Add something"}</h3>
            <ItemFields item={draft} designated={model.designatedApps} onChange={setDraft} />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={!draft.title.trim() || !draft.microAction.trim()} onClick={add}>
                Add to my list
              </Button>
              {!empty && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setAdding(false);
                    setDraft(EMPTY);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        ) : (
          <Button onClick={() => setAdding(true)}>
            <PlusIcon />
            Add something
          </Button>
        )}
      </div>
    </Section>
  );
}
