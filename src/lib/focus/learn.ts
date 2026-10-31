import { appLabel } from "./apps";
import type { DeckState, PendingQuestion } from "./deck/state";
import type { DayRecord } from "./history";
import type { UserModel } from "./model";
import { resolveMode, toModeMap } from "./modes";
import type { AppId, ModeId } from "./types";

/**
 * Learn — accepts, dismisses (sacred, silent) and skips with context feed two
 * things, both gated by the user (Layer 4, Hymah North-Star §6):
 *
 * 1. One boundary question per day at most, asked only at a mode transition,
 *    never mid-flow (Hymah Spec §3.5).
 * 2. Inferences (Class D): plain-words hypotheses with their evidence. They
 *    are visible and deletable, and they change nothing until confirmed.
 *
 * Everything here is deterministic counting — no model — on purpose:
 * "explicit before inferred".
 */

interface QuestionInput {
  model: UserModel;
  deck: DeckState;
  enteringMode: ModeId;
  history: DayRecord[];
}

interface QuestionDef {
  id: string;
  text: (input: QuestionInput) => string;
  eligible: (input: QuestionInput) => boolean;
  apply: (model: UserModel, answer: "yes" | "no") => UserModel;
}

const settled = (model: UserModel, id: string) => model.questions.some((q) => q.questionId === id && q.answer !== "skipped");

const yesterday = (history: DayRecord[], today: string) => [...history].reverse().find((d) => d.day < today && !d.demo);

const QUESTIONS: QuestionDef[] = [
  {
    id: "faster-review",
    text: ({ history, deck }) =>
      `Agents waited about ${yesterday(history, deck.day)?.meanTimeToCloseMinutes}m for you yesterday. Want your review moment every 30 minutes instead?`,
    eligible: ({ model, history, deck }) => {
      const prev = yesterday(history, deck.day);
      return !settled(model, "faster-review") && model.reviewEveryMinutes > 30 && (prev?.meanTimeToCloseMinutes ?? 0) > 45;
    },
    apply: (model, answer) => (answer === "yes" ? { ...model, reviewEveryMinutes: 30 } : model),
  },
  {
    id: "quiet-first-build-hour",
    text: () => "Should I stay quiet during your first build hour?",
    eligible: ({ model, enteringMode }) => enteringMode === "building" && !model.quietFirstBuildHour && !settled(model, "quiet-first-build-hour"),
    apply: (model, answer) => (answer === "yes" ? { ...model, quietFirstBuildHour: true } : model),
  },
];

/** Today's one question, if this boundary is a good moment for it. */
export function pickQuestion(input: QuestionInput): PendingQuestion | null {
  const question = QUESTIONS.find((q) => q.eligible(input));
  return question ? { id: question.id, text: question.text(input) } : null;
}

/** Record the answer and apply it. A "no" is final; a skip may be asked again another day. */
export function applyAnswer(model: UserModel, questionId: string, answer: "yes" | "no" | "skipped", today: string): UserModel {
  const recorded = { ...model, questions: [...model.questions, { questionId, askedOn: today, answer }] };
  const question = QUESTIONS.find((q) => q.id === questionId);
  return question && answer !== "skipped" ? question.apply(recorded, answer) : recorded;
}

/** A Class D inference: a proposal with its evidence, inactionable until you confirm it. */
export interface Hypothesis {
  id: string;
  statement: string;
  evidence: string;
  /** What confirming will change in your model, in plain words. */
  change: string;
  apply: (model: UserModel) => UserModel;
}

const REPEAT_SWITCH_THRESHOLD = 8;
const DISMISS_THRESHOLD = 4;

/** Derive today's open hypotheses. Ones you already confirmed or rejected never come back. */
export function deriveHypotheses(input: { model: UserModel; deck: DeckState; history: DayRecord[] }): Hypothesis[] {
  const { model, deck, history } = input;
  const modes = toModeMap(model.modes);
  const out: Hypothesis[] = [];

  // 1. An app you keep switching to inside a mode may belong to that mode.
  const counts = new Map<string, { mode: ModeId; app: AppId; n: number }>();
  for (const event of deck.events) {
    if (event.kind !== "app-switch" || event.origin === "manual" || model.trapApps.includes(event.app)) continue;
    if (resolveMode(modes, event.modeAtEvent).allowedApps.includes(event.app)) continue;
    const key = `${event.modeAtEvent}:${event.app}`;
    const entry = counts.get(key) ?? { mode: event.modeAtEvent, app: event.app, n: 0 };
    counts.set(key, { ...entry, n: entry.n + 1 });
  }
  for (const { mode, app, n } of counts.values()) {
    if (n < REPEAT_SWITCH_THRESHOLD || !modes[mode]) continue;
    const label = resolveMode(modes, mode).label;
    out.push({
      id: `add-app:${mode}:${app}`,
      statement: `${appLabel(app)} might belong in ${label}.`,
      evidence: `You switched to ${appLabel(app)} ${n}× while in ${label} today, and every one counted as a context switch.`,
      change: `Add ${appLabel(app)} to ${label}'s apps, so those switches count as in-mode work.`,
      apply: (m) => ({ ...m, modes: m.modes.map((md) => (md.id === mode && !md.allowedApps.includes(app) ? { ...md, allowedApps: [...md.allowedApps, app] } : md)) }),
    });
  }

  // 2. Agents waiting long between review moments suggests a shorter cadence.
  const closed = deck.loops.filter((loop) => loop.closedAtMinute !== undefined);
  const recent = [...history].reverse().filter((d) => !d.demo).slice(0, 3);
  const waits = recent.map((d) => d.meanTimeToCloseMinutes).filter((w): w is number => w !== null);
  if (closed.length >= 3) waits.unshift(closed.reduce((s, l) => s + ((l.closedAtMinute ?? 0) - l.openedAtMinute), 0) / closed.length);
  const meanWait = waits.length > 0 ? Math.round(waits.reduce((s, w) => s + w, 0) / waits.length) : 0;
  if (model.reviewEveryMinutes > 30 && meanWait > 45) {
    out.push({
      id: "cadence-30",
      statement: "A shorter review cadence might suit your agents.",
      evidence: `Agents have waited about ${meanWait}m on average before you reached them.`,
      change: "Move your review moment to every 30 minutes.",
      apply: (m) => ({ ...m, reviewEveryMinutes: 30 }),
    });
  }

  // 3. An intention you keep setting aside may not fit how you actually work.
  const byIntention = new Map<string, number>();
  for (const signal of deck.signals) {
    if (signal.trigger === "defection" && signal.response === "dismissed" && signal.intentionId) {
      byIntention.set(signal.intentionId, (byIntention.get(signal.intentionId) ?? 0) + 1);
    }
  }
  for (const [intentionId, n] of byIntention) {
    const intention = model.intentions.find((i) => i.id === intentionId && i.enabled);
    if (!intention || n < DISMISS_THRESHOLD) continue;
    out.push({
      id: `pause-intention:${intentionId}`,
      statement: "One of your intentions may not fit right now.",
      evidence: `You set aside “${intention.text}” ${n}× today. Setting things aside is fine — it's signal, not failure.`,
      change: "Pause this intention (you can turn it back on in Declare).",
      apply: (m) => ({ ...m, intentions: m.intentions.map((i) => (i.id === intentionId ? { ...i, enabled: false } : i)) }),
    });
  }

  const decided = new Set(model.inferences.map((r) => r.id));
  return out.filter((h) => !decided.has(h.id));
}

/** Confirm (apply + record) or reject (record only) a hypothesis. */
export function decideHypothesis(model: UserModel, hypothesis: Hypothesis, confirm: boolean, today: string): UserModel {
  const base = confirm ? hypothesis.apply(model) : model;
  return {
    ...base,
    inferences: [...base.inferences, { id: hypothesis.id, statement: hypothesis.statement, status: confirm ? "confirmed" : "rejected", decidedOn: today }],
  };
}
