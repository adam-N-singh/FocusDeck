/**
 * Offer selection — ported from Hymah's v1 Spec §3.3 ordering, with one new
 * tier for the developer twist: agents blocked on you outrank your own tasks,
 * because an open loop stalls delegated work, not just your list.
 *
 * Hymah's order: due/priority tasks -> pinned intentions -> short content
 * chunks -> declared-interest fallback. Every offer must trace to the user's
 * own inspectable model (Hymah North-Star §4: not a feed, no discovery).
 */

import type { AppId } from "./types";

export type QueueItemKind = "blocked-agent" | "task" | "intention" | "content-chunk" | "interest";

export interface QueueItem {
  id: string;
  kind: QueueItemKind;
  title: string;
  /** Smallest next action, e.g. "Open PR #42" — never the whole task (§3.3). */
  microAction: string;
  priority: number; // lower = sooner
  estimatedMinutes: number;
  /**
   * Where the micro-action happens. Lets mode-scoped offers prefer items that
   * keep you in your mode — accepting must not itself become a context switch.
   */
  app?: AppId;
  /** What Accept pre-loads (Spec §3.3: the accepted thing arrives pre-loaded). */
  url?: string;
}

export const TIER_ORDER: Record<QueueItemKind, number> = {
  "blocked-agent": 0, // new in the twist: open loops first
  task: 1,
  intention: 2,
  "content-chunk": 3,
  interest: 4, // declared-interest fallback, only when nothing is pending
};

/** The one offer for this moment, or null when the queue is empty. Pure + tested. */
export function selectOffer(items: QueueItem[]): QueueItem | null {
  if (items.length === 0) return null;
  return [...items].sort(
    (a, b) => TIER_ORDER[a.kind] - TIER_ORDER[b.kind] || a.priority - b.priority,
  )[0];
}

/**
 * The implementation intention, in the user's own calm-moment words
 * (Hymah North-Star §5 / Spec §3.1), shown back verbatim at the hot moment.
 */
export const IMPLEMENTATION_INTENTION =
  "When an agent finishes or blocks while I'm building, batch it until my review moment — then show me the blocked agent first.";

/** Seed queue for the demo: one blocked agent, one intention, one fallback. */
export const DEMO_QUEUE: QueueItem[] = [
  { id: "q1", kind: "blocked-agent", title: "Claude Code session is blocked on a choice", microAction: "Open the session and answer", priority: 1, estimatedMinutes: 2 },
  { id: "q2", kind: "task", title: "Review PR #42", microAction: "Open the PR", priority: 1, estimatedMinutes: 5 },
  { id: "q3", kind: "intention", title: "Reply to Dana about the launch post", microAction: "Open the thread and draft one line", priority: 2, estimatedMinutes: 3 },
  { id: "q4", kind: "interest", title: "Rust — declared interest", microAction: "Start lesson 4 (20 min, or just the first exercise)", priority: 3, estimatedMinutes: 20 },
];
