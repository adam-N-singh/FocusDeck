"use client";

import { useState } from "react";
import { appLabel } from "@/lib/focus/apps";
import type { UserModel } from "@/lib/focus/model";
import { kindPolicy, withKindPolicy, type KindPolicy } from "@/lib/focus/modes";
import type { EventKind, Mode } from "@/lib/focus/types";
import { modeRuleSentence } from "@/components/deck/modeRule";
import { ChevronIcon, PlusIcon } from "@/components/ui/icons";
import { hueProps, modeTint } from "@/components/ui/modeColor";
import { Button, Chip, Group, Section, Toggle, inputClass } from "@/components/ui/primitives";
import { Field, type Update } from "./controls";

const KINDS: { kind: Exclude<EventKind, "app-switch">; label: string }[] = [
  { kind: "agent-needs-input", label: "Blocked agents" },
  { kind: "agent-finished", label: "Finished agents" },
  { kind: "notification", label: "Notifications" },
];

const POLICY_LABEL: Record<KindPolicy, string> = { interrupt: "Interrupt", decide: "Decide case by case", hold: "Wait" };

function PolicyPicker({ mode, kind, label, onChange }: { mode: Mode; kind: EventKind; label: string; onChange: (p: KindPolicy) => void }) {
  // A blocked agent is never left to a model: it interrupts, or it waits for you.
  const options: KindPolicy[] = kind === "agent-needs-input" ? ["interrupt", "hold"] : ["interrupt", "decide", "hold"];
  const current = kindPolicy(mode, kind);
  return (
    <div role="radiogroup" aria-label={`${label} during ${mode.label || "this mode"}`} className="flex flex-wrap gap-1.5">
      {options.map((p) => (
        <Chip key={p} role="radio" pressed={current === p} onClick={() => onChange(p)}>
          {POLICY_LABEL[p]}
        </Chip>
      ))}
    </div>
  );
}

function ModeEditor({ mode, designated, onChange, onDelete }: { mode: Mode; designated: UserModel["designatedApps"]; onChange: (m: Mode) => void; onDelete?: () => void }) {
  const toggleApp = (app: string) =>
    onChange({ ...mode, allowedApps: mode.allowedApps.includes(app) ? mode.allowedApps.filter((a) => a !== app) : [...mode.allowedApps, app] });

  return (
    <div className="space-y-6 border-t border-line bg-sunk/40 px-4 py-5 sm:px-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <Field label="Name">
          <input value={mode.label} onChange={(e) => onChange({ ...mode, label: e.target.value })} className={`${inputClass} font-medium`} />
        </Field>
        <Field label="What it’s for, in your words">
          <textarea
            value={mode.description}
            rows={2}
            onChange={(e) => onChange({ ...mode, description: e.target.value })}
            className={`${inputClass} voice resize-y text-base leading-6`}
            placeholder="Heads down on the build, editor and terminal only."
          />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm text-ink-2">Apps that belong here</legend>
        <p className="mt-0.5 text-xs leading-5 text-ink-3">Switching between these is the work, not a distraction.</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {designated.length === 0 && <span className="text-sm text-ink-2">Turn on some apps above first.</span>}
          {designated.map((app) => (
            <Chip key={app} pressed={mode.allowedApps.includes(app)} onClick={() => toggleApp(app)}>
              {appLabel(app)}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm text-ink-2">What may reach you</legend>
        <div className="mt-2.5 space-y-3">
          {KINDS.map(({ kind, label }) => (
            <div key={kind} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
              <span className="w-36 shrink-0 text-sm text-ink">{label}</span>
              <PolicyPicker mode={mode} kind={kind} label={label} onChange={(p) => onChange(withKindPolicy(mode, kind, p))} />
            </div>
          ))}
        </div>
        <p className="mt-2.5 max-w-[60ch] text-xs leading-5 text-ink-3">
          Case by case means FocusDeck judges each one on this machine, from metadata only, or holds it if that’s switched off in Rhythm.
          Whatever waits is kept for later, never dropped.
        </p>
      </fieldset>

      <Toggle
        checked={mode.isProtected !== false}
        onChange={(isProtected) => onChange({ ...mode, isProtected })}
        label="Protect this mode"
        description="Being interrupted here costs a full refocus. Turn it off for modes where answering is the job."
      />

      {onDelete ? (
        <div className="border-t border-line pt-4">
          <Button size="sm" variant="danger" onClick={onDelete}>Delete {mode.label || "this mode"}</Button>
        </div>
      ) : (
        <p className="text-xs text-ink-3">A built-in mode. You can reshape it, but not delete it.</p>
      )}
    </div>
  );
}

/** Modes are declared by you first: yours to rename, reshape, add and remove. */
export function ModesSection({ model, update, newId }: { model: UserModel; update: Update; newId: (prefix: string) => string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const setMode = (next: Mode) => update((m) => ({ ...m, modes: m.modes.map((mode) => (mode.id === next.id ? next : mode)) }));
  const addMode = () => {
    const name = label.trim();
    if (!name) return;
    const id = newId("mode");
    update((m) => ({
      ...m,
      modes: [...m.modes, { id, label: name, allowedApps: [], interruptibleBy: ["agent-needs-input"], ambiguous: ["agent-finished"], isProtected: true, description: "" }],
    }));
    setLabel("");
    setOpenId(id);
  };
  const remove = (mode: Mode) => {
    if (!window.confirm(`Delete the ${mode.label || "unnamed"} mode? If-then plans that mention it will stop matching.`)) return;
    update((m) => ({ ...m, modes: m.modes.filter((x) => x.id !== mode.id) }));
    setOpenId(null);
  };

  return (
    <Section title="Modes" description="Each mode has its own colour and its own rule for what may reach you. Switch between them on Now, or with the number keys.">
      <Group label="Your modes">
        {model.modes.map((mode, i) => {
          const open = openId === mode.id;
          return (
            <li key={mode.id} {...hueProps(modeTint(model.modes, mode.id))}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`mode-editor-${mode.id}`}
                onClick={() => setOpenId(open ? null : mode.id)}
                className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-ink/[0.03] sm:px-5"
              >
                <span aria-hidden className="mt-1.5 size-3 shrink-0 rounded-full bg-accent" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-base font-medium text-ink">{mode.label || "Unnamed mode"}</span>
                    {i < 9 && <span className="text-xs text-ink-3">key {i + 1}</span>}
                  </span>
                  <span className="mt-0.5 block max-w-[62ch] text-sm leading-6 text-ink-2">{modeRuleSentence(mode)}</span>
                </span>
                <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-sm text-ink-3">
                  {open ? "Done" : "Edit"}
                  <ChevronIcon size={14} className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
                </span>
              </button>
              {open && (
                <div id={`mode-editor-${mode.id}`}>
                  <ModeEditor mode={mode} designated={model.designatedApps} onChange={setMode} onDelete={mode.builtIn ? undefined : () => remove(mode)} />
                </div>
              )}
            </li>
          );
        })}
      </Group>
      <form
        className="mt-3 flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addMode();
        }}
      >
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="A new mode, like Meetings" className={inputClass} aria-label="New mode name" />
        <Button type="submit" disabled={!label.trim()}>
          <PlusIcon />
          Add mode
        </Button>
      </form>
    </Section>
  );
}
