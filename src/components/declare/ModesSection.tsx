"use client";

import { useState } from "react";
import { appLabel } from "@/lib/focus/apps";
import type { UserModel } from "@/lib/focus/model";
import { describeModeRule, kindPolicy, withKindPolicy, type KindPolicy } from "@/lib/focus/modes";
import type { EventKind, Mode } from "@/lib/focus/types";
import { Button, Panel, Toggle, inputClass } from "@/components/ui/primitives";

const KINDS: { kind: Exclude<EventKind, "app-switch">; label: string }[] = [
  { kind: "agent-needs-input", label: "An agent blocked on me" },
  { kind: "agent-finished", label: "An agent finishing" },
  { kind: "notification", label: "Notifications" },
];

const POLICY_LABEL: Record<KindPolicy, string> = { interrupt: "Interrupt", decide: "Ask System One", hold: "Wait" };

function PolicyPicker({ mode, kind, onChange }: { mode: Mode; kind: EventKind; onChange: (p: KindPolicy) => void }) {
  // A blocked agent is never model-gated: it interrupts or it waits as an open loop.
  const options: KindPolicy[] = kind === "agent-needs-input" ? ["interrupt", "hold"] : ["interrupt", "decide", "hold"];
  const current = kindPolicy(mode, kind);
  return (
    <div role="radiogroup" className="flex flex-wrap gap-1">
      {options.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={current === p}
          onClick={() => onChange(p)}
          className={`rounded-full px-2.5 py-1 text-xs ${current === p ? "bg-zinc-100 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
        >
          {POLICY_LABEL[p]}
        </button>
      ))}
    </div>
  );
}

function ModeCard({ mode, designated, onChange, onDelete }: { mode: Mode; designated: UserModel["designatedApps"]; onChange: (m: Mode) => void; onDelete?: () => void }) {
  const toggleApp = (app: (typeof designated)[number]) =>
    onChange({ ...mode, allowedApps: mode.allowedApps.includes(app) ? mode.allowedApps.filter((a) => a !== app) : [...mode.allowedApps, app] });
  return (
    <div className="space-y-3 rounded-xl bg-zinc-950/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Mode name" value={mode.label} onChange={(e) => onChange({ ...mode, label: e.target.value })} className={`${inputClass} max-w-56 font-medium`} />
        {mode.builtIn ? <span className="text-xs text-zinc-500">built-in</span> : onDelete && <Button size="sm" variant="danger" onClick={onDelete}>Delete mode</Button>}
      </div>
      <textarea aria-label={`${mode.label} description`} value={mode.description} rows={2} onChange={(e) => onChange({ ...mode, description: e.target.value })} className={inputClass} placeholder="In your words: what is this mode for?" />
      <div>
        <p className="text-xs text-zinc-500">Apps that belong here (switching to them is in-mode work)</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {designated.length === 0 && <span className="text-xs text-amber-200/90">Designate apps first.</span>}
          {designated.map((app) => (
            <button
              key={app}
              type="button"
              aria-pressed={mode.allowedApps.includes(app)}
              onClick={() => toggleApp(app)}
              className={`rounded-full px-2.5 py-1 text-xs ${mode.allowedApps.includes(app) ? "bg-emerald-400/90 text-zinc-950" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
            >
              {appLabel(app)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {KINDS.map(({ kind, label }) => (
          <div key={kind}>
            <p className="mb-1 text-xs text-zinc-500">{label}</p>
            <PolicyPicker mode={mode} kind={kind} onChange={(p) => onChange(withKindPolicy(mode, kind, p))} />
          </div>
        ))}
      </div>
      <Toggle checked={mode.isProtected !== false} onChange={(isProtected) => onChange({ ...mode, isProtected })} label="Protected (a focus mode)" description="Interruptions here cost a full refocus. Turn off for modes where attending is the work." />
      <p className="text-xs leading-5 text-zinc-400">{describeModeRule(mode)}</p>
    </div>
  );
}

/** Modes are user-declared first (PRODUCT.md): yours to rename, reshape, add, and remove. */
export function ModesSection({ model, update, newId }: { model: UserModel; update: (fn: (m: UserModel) => UserModel) => void; newId: (prefix: string) => string }) {
  const [label, setLabel] = useState("");
  const setMode = (next: Mode) => update((m) => ({ ...m, modes: m.modes.map((mode) => (mode.id === next.id ? next : mode)) }));
  const addMode = () => {
    const name = label.trim();
    if (!name) return;
    update((m) => ({
      ...m,
      modes: [...m.modes, { id: newId("mode"), label: name, allowedApps: [], interruptibleBy: ["agent-needs-input"], ambiguous: ["agent-finished"], isProtected: true, description: "" }],
    }));
    setLabel("");
  };
  return (
    <Panel id="modes" title="Your modes" kicker="What each mode lets through">
      <div className="grid gap-3 lg:grid-cols-2">
        {model.modes.map((mode) => (
          <ModeCard
            key={mode.id}
            mode={mode}
            designated={model.designatedApps}
            onChange={setMode}
            onDelete={mode.builtIn ? undefined : () => update((m) => ({ ...m, modes: m.modes.filter((x) => x.id !== mode.id) }))}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMode()} placeholder="A new mode, e.g. Meetings" className={`${inputClass} max-w-64`} aria-label="New mode name" />
        <Button onClick={addMode} disabled={!label.trim()}>Add mode</Button>
      </div>
    </Panel>
  );
}
