import type { Mirror } from "../focus/mirror";

/**
 * System Two (DECISION-MODELS.md, Layer 3): a reasoning LLM that works slowly,
 * off the hot path — never per event. It is opt-in, and what it may see is
 * fixed here: aggregate numbers and the user's own declared words. Never an
 * event label, a session id, a timestamp, or anything a sensor observed.
 * The server re-validates every payload with the sanitizers below, so the
 * boundary holds even if a client sends more.
 */
export const MAX_TEXT = 280;
const MAX_ITEMS = 12;

export interface SynthesisPayload {
  demo: boolean;
  state: string | null;
  weeks: {
    weekStart: string;
    state: string | null;
    forgiven: boolean;
    contextPerFocusHour: number | null;
    meanTimeToCloseMinutes: number | null;
    defectionAcceptRate: number | null;
    focusHours: number;
  }[];
  cumulative: { label: string; value: number }[];
  misses: { label: string; count: number }[];
  supportive: string | null;
  coming: string[];
  /** The user's own intentions, verbatim — declared words, not observations. */
  intentions: string[];
}

export function buildSynthesisPayload(mirror: Mirror, intentions: string[]): SynthesisPayload {
  return {
    demo: mirror.hasDemo,
    state: mirror.state,
    weeks: mirror.weeks.map((w) => ({
      weekStart: w.weekStart,
      state: w.state,
      forgiven: w.forgiven,
      contextPerFocusHour: w.contextPerFocusHour,
      meanTimeToCloseMinutes: w.meanTimeToCloseMinutes,
      defectionAcceptRate: w.defectionAcceptRate,
      focusHours: Math.round(w.focusMinutes / 6) / 10,
    })),
    cumulative: mirror.cumulative.map(({ label, value }) => ({ label, value })),
    misses: mirror.misses,
    supportive: mirror.supportive,
    coming: mirror.coming,
    intentions,
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === "string" ? v.slice(0, MAX_TEXT) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const list = <T>(v: unknown, each: (item: unknown) => T | null): T[] =>
  Array.isArray(v) ? v.slice(0, MAX_ITEMS).map(each).filter((x): x is T => x !== null) : [];

/** Rebuild a synthesis payload from untrusted input, keeping only the allowed fields. */
export function sanitizeSynthesisPayload(raw: unknown): SynthesisPayload | null {
  if (!isRecord(raw)) return null;
  return {
    demo: raw.demo === true,
    state: text(raw.state),
    weeks: list(raw.weeks, (w) =>
      isRecord(w) && text(w.weekStart)
        ? {
            weekStart: text(w.weekStart) as string,
            state: text(w.state),
            forgiven: w.forgiven === true,
            contextPerFocusHour: num(w.contextPerFocusHour),
            meanTimeToCloseMinutes: num(w.meanTimeToCloseMinutes),
            defectionAcceptRate: num(w.defectionAcceptRate),
            focusHours: num(w.focusHours) ?? 0,
          }
        : null,
    ),
    cumulative: list(raw.cumulative, (c) => (isRecord(c) && text(c.label) && num(c.value) !== null ? { label: text(c.label) as string, value: num(c.value) as number } : null)),
    misses: list(raw.misses, (m) => (isRecord(m) && text(m.label) && num(m.count) !== null ? { label: text(m.label) as string, count: num(m.count) as number } : null)),
    supportive: text(raw.supportive),
    coming: list(raw.coming, text),
    intentions: list(raw.intentions, text),
  };
}

/**
 * The deterministic synthesis used whenever System Two is off, has no
 * credentials, or declines: the same facts, plainly assembled.
 */
export function templateSynthesis(p: SynthesisPayload): string {
  const parts: string[] = [];
  if (p.demo) parts.push("This is demo data.");
  parts.push(p.state ? `This week reads ${p.state.toLowerCase()}.` : "There aren't enough weeks yet to name a trend.");
  if (p.supportive) parts.push(p.supportive);
  const counted = p.misses.filter((m) => m.count > 0).map((m) => `${m.count} × ${m.label.toLowerCase()}`);
  parts.push(counted.length > 0 ? `Counted plainly: ${counted.join("; ")}.` : "No misses to count this week.");
  if (p.coming[0]) parts.push(`Next week: ${p.coming[0].charAt(0).toLowerCase()}${p.coming[0].slice(1)}`);
  return parts.join(" ");
}
