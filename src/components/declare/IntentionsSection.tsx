"use client";

import { useState } from "react";
import { appLabel } from "@/lib/focus/apps";
import {
  BATCHABLE_WHENS,
  draftIntentionText,
  type ImplementationIntention,
  type IntentionWhen,
  type OfferTarget,
} from "@/lib/focus/intentions";
import type { UserModel } from "@/lib/focus/model";
import { PlusIcon } from "@/components/ui/icons";
import { Button, Group, Section, inputClass, selectClass } from "@/components/ui/primitives";
import { Switch, type Update } from "./controls";

type Fields = Pick<ImplementationIntention, "when" | "app" | "mode" | "then">;

/** The same choices as the engine's, in this screen's words. */
const WHEN: Record<IntentionWhen, string> = {
  "opens-trap": "When I open a distraction",
  "agent-blocks": "When an agent is blocked on me",
  "agent-finishes": "When an agent finishes",
  notification: "When a notification arrives",
  "review-moment": "When my review moment arrives",
  "enters-mode": "When I switch into a mode",
};

const THEN: Record<OfferTarget, string> = {
  "queue-top": "offer the next thing on my list",
  "blocked-agents": "show me the blocked agent first",
  tasks: "show me my tasks",
  intentions: "show me what I pinned",
  content: "offer something short to read",
  interests: "offer one of my interests",
  batch: "hold it until my review",
};

const draft = (fields: Fields, model: UserModel) => draftIntentionText(fields, model.modes).replace("a trap app", "a distraction");

/** What a plan matches, in plain words, under the words you wrote. */
function matchLine(fields: Fields, model: UserModel): string {
  const modeName = model.modes.find((m) => m.id === fields.mode)?.label ?? "a mode that no longer exists";
  const when =
    fields.when === "opens-trap" && fields.app
      ? `When I open ${appLabel(fields.app)}`
      : fields.when === "enters-mode"
        ? `When I switch into ${fields.mode === "any" ? "any mode" : modeName}`
        : WHEN[fields.when];
  const scope = fields.when === "enters-mode" ? "" : fields.mode === "any" ? ", in any mode" : `, during ${modeName}`;
  return `${when}${scope}: ${THEN[fields.then]}.`;
}

/** The structured choices, laid out to read as a sentence. */
function FieldPickers({ fields, model, onChange }: { fields: Fields; model: UserModel; onChange: (f: Fields) => void }) {
  const targets = (Object.keys(THEN) as OfferTarget[]).filter((t) => t !== "batch" || BATCHABLE_WHENS.includes(fields.when));
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
      <select
        aria-label="When"
        className={selectClass}
        value={fields.when}
        onChange={(e) => {
          const when = e.target.value as IntentionWhen;
          onChange({
            ...fields,
            when,
            app: when === "opens-trap" ? fields.app : undefined,
            then: fields.then === "batch" && !BATCHABLE_WHENS.includes(when) ? "queue-top" : fields.then,
          });
        }}
      >
        {(Object.keys(WHEN) as IntentionWhen[]).map((w) => (
          <option key={w} value={w}>{WHEN[w]}</option>
        ))}
      </select>
      {fields.when === "opens-trap" && (
        <select
          aria-label="Which distraction"
          className={selectClass}
          value={fields.app ?? ""}
          onChange={(e) => onChange({ ...fields, app: (e.target.value || undefined) as Fields["app"] })}
        >
          <option value="">any distraction</option>
          {model.trapApps.map((app) => (
            <option key={app} value={app}>{appLabel(app)}</option>
          ))}
        </select>
      )}
      <span>{fields.when === "enters-mode" ? "entering" : "during"}</span>
      <select aria-label="Mode" className={selectClass} value={fields.mode} onChange={(e) => onChange({ ...fields, mode: e.target.value })}>
        <option value="any">any mode</option>
        {model.modes.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>
      <span>then</span>
      <select aria-label="Then" className={selectClass} value={fields.then} onChange={(e) => onChange({ ...fields, then: e.target.value as OfferTarget })}>
        {targets.map((t) => (
          <option key={t} value={t}>{THEN[t]}</option>
        ))}
      </select>
    </div>
  );
}

function NewPlan({ model, onAdd, onCancel }: { model: UserModel; onAdd: (i: Omit<ImplementationIntention, "id">) => void; onCancel?: () => void }) {
  const [fields, setFields] = useState<Fields>({ when: "opens-trap", mode: "any", then: "queue-top" });
  const [text, setText] = useState<string | null>(null); // null = still the draft
  const shown = text ?? draft(fields, model);
  return (
    <div className="space-y-4 rounded-2xl border border-dashed border-line-strong p-4 sm:p-5">
      <h3 className="text-base font-semibold text-ink">New if-then plan</h3>
      <FieldPickers fields={fields} model={model} onChange={setFields} />
      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-2">In your own words</span>
        <textarea rows={2} value={shown} onChange={(e) => setText(e.target.value)} className={`${inputClass} voice resize-y text-base leading-7`} />
        <span className="mt-1.5 block text-xs leading-5 text-ink-3">
          {text === null
            ? "A first draft from the choices above. Rewrite it the way you’d say it; FocusDeck shows exactly this back to you."
            : "Your words. FocusDeck shows them back exactly like this."}
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={!shown.trim()}
          onClick={() => {
            onAdd({ ...fields, text: shown.trim(), enabled: true });
            setText(null);
          }}
        >
          Add plan
        </Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  );
}

/**
 * Mode-scoped implementation intentions: "When I open X during Building,
 * show me…". Written in a calm moment, shown back verbatim at the hot one.
 */
export function IntentionsSection({ model, update, newId }: { model: UserModel; update: Update; newId: (prefix: string) => string }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const empty = model.intentions.length === 0;
  const set = (id: string, patch: Partial<ImplementationIntention>) =>
    update((m) => ({ ...m, intentions: m.intentions.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const remove = (intention: ImplementationIntention) => {
    if (!window.confirm("Delete this if-then plan? Your words go with it.")) return;
    update((m) => ({ ...m, intentions: m.intentions.filter((i) => i.id !== intention.id) }));
    if (editingId === intention.id) setEditingId(null);
  };

  return (
    <Section title="If-then plans" description="Decide now, in a calm moment, what you want at the hot one. FocusDeck shows your words back exactly as you wrote them.">
      {!empty && (
        <Group label="Your if-then plans">
          {model.intentions.map((intention) => {
            const editing = editingId === intention.id;
            return (
              <li key={intention.id} className="px-4 py-4 sm:px-5">
                <div className="flex items-start gap-3 sm:gap-4">
                  <span className="pt-1">
                    <Switch checked={intention.enabled} onChange={(enabled) => set(intention.id, { enabled })} label={`${intention.enabled ? "Active" : "Off"}: ${intention.text}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`voice text-base leading-7 ${intention.enabled ? "text-ink" : "text-ink-3"}`}>
                      “{intention.text || "No words yet"}”
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-ink-3">
                      {intention.enabled ? "" : "Off. "}
                      {matchLine(intention, model)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    <Button size="sm" variant="ghost" aria-expanded={editing} onClick={() => setEditingId(editing ? null : intention.id)}>
                      {editing ? "Done" : "Edit"}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(intention)} aria-label={`Delete “${intention.text}”`}>
                      Delete
                    </Button>
                  </div>
                </div>
                {editing && (
                  <div className="mt-4 space-y-4 border-t border-line pt-4 sm:ml-14">
                    <FieldPickers fields={intention} model={model} onChange={(f) => set(intention.id, f)} />
                    <label className="block">
                      <span className="mb-1.5 block text-sm text-ink-2">In your own words</span>
                      <textarea
                        rows={2}
                        value={intention.text}
                        onChange={(e) => set(intention.id, { text: e.target.value })}
                        className={`${inputClass} voice resize-y text-base leading-7`}
                      />
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </Group>
      )}

      <div className={empty ? "" : "mt-3"}>
        {empty || adding ? (
          <>
            {empty && <p className="mb-3 text-sm text-ink-2">None yet. Start with the moment you most want back.</p>}
            <NewPlan
              model={model}
              onAdd={(i) => {
                update((m) => ({ ...m, intentions: [...m.intentions, { ...i, id: newId("i") }] }));
                setAdding(false);
              }}
              onCancel={empty ? undefined : () => setAdding(false)}
            />
          </>
        ) : (
          <Button onClick={() => setAdding(true)}>
            <PlusIcon />
            New if-then plan
          </Button>
        )}
      </div>

      <p className="mt-4 max-w-[64ch] text-xs leading-5 text-ink-3">
        “Hold it until my review” can only make FocusDeck quieter than your mode allows, never louder. A blocked agent it holds still waits for
        you in Waiting on you.
      </p>
    </Section>
  );
}
