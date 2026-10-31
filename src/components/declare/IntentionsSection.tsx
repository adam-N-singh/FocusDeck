"use client";

import { useState } from "react";
import { appLabel } from "@/lib/focus/apps";
import {
  BATCHABLE_WHENS,
  TARGET_LABELS,
  WHEN_LABELS,
  draftIntentionText,
  type ImplementationIntention,
  type IntentionWhen,
  type OfferTarget,
} from "@/lib/focus/intentions";
import type { UserModel } from "@/lib/focus/model";
import { Button, Panel, Toggle, inputClass } from "@/components/ui/primitives";

type Fields = Pick<ImplementationIntention, "when" | "app" | "mode" | "then">;

const selectClass = "rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100";

function FieldPickers({ fields, model, onChange }: { fields: Fields; model: UserModel; onChange: (f: Fields) => void }) {
  const targets = (Object.keys(TARGET_LABELS) as OfferTarget[]).filter((t) => t !== "batch" || BATCHABLE_WHENS.includes(fields.when));
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
      <select aria-label="When" className={selectClass} value={fields.when} onChange={(e) => {
        const when = e.target.value as IntentionWhen;
        onChange({ ...fields, when, app: when === "opens-trap" ? fields.app : undefined, then: fields.then === "batch" && !BATCHABLE_WHENS.includes(when) ? "queue-top" : fields.then });
      }}>
        {(Object.keys(WHEN_LABELS) as IntentionWhen[]).map((w) => <option key={w} value={w}>{WHEN_LABELS[w]}</option>)}
      </select>
      {fields.when === "opens-trap" && (
        <select aria-label="Which trap app" className={selectClass} value={fields.app ?? ""} onChange={(e) => onChange({ ...fields, app: (e.target.value || undefined) as Fields["app"] })}>
          <option value="">any trap app</option>
          {model.trapApps.map((app) => <option key={app} value={app}>{appLabel(app)}</option>)}
        </select>
      )}
      <span>{fields.when === "enters-mode" ? "entering" : "during"}</span>
      <select aria-label="Mode" className={selectClass} value={fields.mode} onChange={(e) => onChange({ ...fields, mode: e.target.value })}>
        <option value="any">any mode</option>
        {model.modes.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
      <span>→</span>
      <select aria-label="Then" className={selectClass} value={fields.then} onChange={(e) => onChange({ ...fields, then: e.target.value as OfferTarget })}>
        {targets.map((t) => <option key={t} value={t}>{TARGET_LABELS[t]}</option>)}
      </select>
    </div>
  );
}

function AddIntention({ model, onAdd }: { model: UserModel; onAdd: (i: Omit<ImplementationIntention, "id">) => void }) {
  const [fields, setFields] = useState<Fields>({ when: "opens-trap", mode: "any", then: "queue-top" });
  const [text, setText] = useState<string | null>(null); // null = still the draft
  const shown = text ?? draftIntentionText(fields, model.modes);
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-zinc-700 p-4">
      <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">New intention</p>
      <FieldPickers fields={fields} model={model} onChange={setFields} />
      <textarea aria-label="In your own words" rows={2} value={shown} onChange={(e) => setText(e.target.value)} className={inputClass} />
      <p className="text-xs text-zinc-500">
        {text === null ? "A draft from the fields above — rewrite it in your own words. That's what FocusDeck will show back to you." : "Your words. FocusDeck shows this back verbatim."}
      </p>
      <Button variant="primary" disabled={!shown.trim()} onClick={() => { onAdd({ ...fields, text: shown.trim(), enabled: true }); setText(null); }}>
        Add intention
      </Button>
    </div>
  );
}

/**
 * Mode-scoped implementation intentions — new in the combination: "When I
 * open X *during Building*, show me…". Written in a calm moment, shown back
 * verbatim at the hot one (Hymah North-Star §5).
 */
export function IntentionsSection({ model, update, newId }: { model: UserModel; update: (fn: (m: UserModel) => UserModel) => void; newId: (prefix: string) => string }) {
  const set = (id: string, patch: Partial<ImplementationIntention>) =>
    update((m) => ({ ...m, intentions: m.intentions.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  return (
    <Panel id="intentions" title="Your implementation intentions" kicker="In your own words">
      <div className="space-y-3">
        {model.intentions.length === 0 && <p className="text-sm text-zinc-400">None yet. Add one below — start with the moment you most want back.</p>}
        {model.intentions.map((intention) => (
          <div key={intention.id} className={`space-y-2 rounded-xl bg-zinc-950/60 p-4 ${intention.enabled ? "" : "opacity-60"}`}>
            <textarea aria-label="Intention text" rows={2} value={intention.text} onChange={(e) => set(intention.id, { text: e.target.value })} className={inputClass} />
            <FieldPickers fields={intention} model={model} onChange={(f) => set(intention.id, f)} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Toggle checked={intention.enabled} onChange={(enabled) => set(intention.id, { enabled })} label={intention.enabled ? "Active" : "Paused"} />
              <Button size="sm" variant="danger" onClick={() => update((m) => ({ ...m, intentions: m.intentions.filter((i) => i.id !== intention.id) }))}>Delete</Button>
            </div>
          </div>
        ))}
        <AddIntention model={model} onAdd={(i) => update((m) => ({ ...m, intentions: [...m.intentions, { ...i, id: newId("i") }] }))} />
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-500">
        “Batch it” can only make FocusDeck quieter than your mode allows — never louder — and a blocked agent it batches still waits for
        you as an open loop.
      </p>
    </Panel>
  );
}
