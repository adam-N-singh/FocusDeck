import { classifyNotification } from "@/lib/focus/classifier";
import type { FocusEvent } from "@/lib/focus/types";

const BADGE: Record<string, string> = {
  "needs-you-now": "bg-attention-soft text-attention",
  "batch-for-later": "bg-attention-soft text-attention",
  "suppress-in-mode": "bg-sunk text-ink-2",
};

/**
 * The clear activity log the thread asked for ("a clear activity log before
 * letting it manage notifications automatically") — every held-back item
 * shows its classification and the rule that produced it.
 */
export function EventTimeline({ events }: { events: FocusEvent[] }) {
  return (
    <section aria-label="Activity log" className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="text-base font-semibold text-ink">Event by event</h2>
      <ol className="mt-3 space-y-2">
        {events.map((event) => {
          const classified = event.kind === "app-switch" ? null : classifyNotification(event, event.modeAtEvent);
          return (
            <li key={event.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl bg-sunk px-3 py-2 text-sm">
              <span className="text-xs text-ink-3 tabular-nums">{String(event.atMinute).padStart(3, "0")}m</span>
              <span className="text-ink">{event.label}</span>
              <span className="text-xs text-ink-3">in {event.modeAtEvent}</span>
              {classified && (
                <span className={`rounded-full px-2 py-0.5 text-xs ${BADGE[classified.classification]}`} title={classified.reason}>
                  {classified.classification}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {events.length === 0 && <p className="mt-3 text-sm text-ink-3">No events yet — run a simulated day.</p>}
    </section>
  );
}
