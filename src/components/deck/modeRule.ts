import { appLabel } from "@/lib/focus/apps";
import { kindPolicy } from "@/lib/focus/modes";
import type { EventKind, Mode } from "@/lib/focus/types";

const KINDS: [Exclude<EventKind, "app-switch">, string][] = [
  ["agent-needs-input", "blocked agents"],
  ["agent-finished", "finished agents"],
  ["notification", "notifications"],
];

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * What a mode lets through, said the way a person would say it. Generated
 * from the mode's settings, so it is always true of the mode as configured.
 */
export function modeRuleSentence(mode: Mode): string {
  const by = (policy: ReturnType<typeof kindPolicy>) => KINDS.filter(([kind]) => kindPolicy(mode, kind) === policy).map(([, words]) => words);
  const through = by("interrupt");
  const judged = by("decide");
  const parts: string[] = [];
  if (through.length === 0) parts.push("Nothing interrupts.");
  else if (mode.isProtected !== false) parts.push(`Only ${list(through)} can interrupt.`);
  else parts.push(`${capital(list(through))} reach you right away.`);
  if (judged.length > 0) parts.push(`FocusDeck decides on ${list(judged)} case by case.`);
  if (through.length + judged.length < KINDS.length) parts.push("Everything else waits.");
  return parts.join(" ");
}

export function homeApps(mode: Mode): string {
  return mode.allowedApps.length > 0 ? list(mode.allowedApps.map(appLabel)) : "none yet";
}
