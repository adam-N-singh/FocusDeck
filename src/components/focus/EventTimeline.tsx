import { classifyNotification } from "@/lib/focus/classifier";
import type { FocusEvent } from "@/lib/focus/types";

const BADGE: Record<string, string> = {
  "needs-you-now": "bg-red-400/15 text-red-300",
  "batch-for-later": "bg-amber-400/15 text-amber-300",
  "suppress-in-mode": "bg-zinc-700/50 text-zinc-400",
};

/**
 * The clear activity log the thread asked for ("a clear activity log before
 * letting it manage notifications automatically") — every held-back item
 * shows its classification and the rule that produced it.
 */
export function EventTimeline({ events }: { events: FocusEvent[] }) {
  return (
    <section aria-label="Activity log" className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h2 className="text-sm font-semibold tracking-wide text-zinc-200">ACTIVITY LOG</h2>
      <ol className="mt-3 space-y-2">
        {events.map((event) => {
          const classified = event.kind === "app-switch" ? null : classifyNotification(event, event.modeAtEvent);
          return (
            <li key={event.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl bg-zinc-950/60 px-3 py-2 text-sm">
              <span className="font-mono text-xs text-zinc-500">{String(event.atMinute).padStart(3, "0")}m</span>
              <span className="text-zinc-200">{event.label}</span>
              <span className="text-xs text-zinc-500">in {event.modeAtEvent}</span>
              {classified && (
                <span className={`rounded-full px-2 py-0.5 text-xs ${BADGE[classified.classification]}`} title={classified.reason}>
                  {classified.classification}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {events.length === 0 && <p className="mt-3 text-sm text-zinc-500">No events yet — run a simulated day.</p>}
    </section>
  );
}
