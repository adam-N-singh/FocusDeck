import { MODES } from "@/lib/focus/modes";
import type { ModeId } from "@/lib/focus/types";

interface ModeDockProps {
  activeMode: ModeId;
  onChange: (mode: ModeId) => void;
  paused: boolean;
  onTogglePaused: () => void;
}

/**
 * The mode dock — the borrowed idea from the quoted post ("an AI-native dock
 * with custom modes"), with the thread's requested safety controls built in:
 * a one-click pause and a plain-English description of what each mode lets through.
 */
export function ModeDock({ activeMode, onChange, paused, onTogglePaused }: ModeDockProps) {
  return (
    <section aria-label="Focus modes" className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-200">MODE DOCK</h2>
        <button
          onClick={onTogglePaused}
          className={`rounded-full px-3 py-1 text-xs font-medium ${paused ? "bg-amber-400 text-zinc-950" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"}`}
        >
          {paused ? "Paused — resume guarding" : "Pause guarding"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Modes">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            role="tab"
            aria-selected={mode.id === activeMode}
            onClick={() => onChange(mode.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              mode.id === activeMode
                ? "bg-emerald-400 text-zinc-950"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-400">
        {paused
          ? "Guarding is paused: nothing is batched or suppressed. The activity log below still records everything."
          : MODES.find((m) => m.id === activeMode)?.description}
      </p>
    </section>
  );
}
