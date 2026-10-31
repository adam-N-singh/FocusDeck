import { APP_IDS, isAppId } from "./apps";
import { BATCHABLE_WHENS, type ImplementationIntention, type IntentionWhen, type OfferTarget } from "./intentions";
import { MODES, REVIEW_MODE_ID } from "./modes";
import { DEMO_QUEUE, type QueueItem, type QueueItemKind } from "./offer";
import type { AppId, EventKind, Mode } from "./types";

/**
 * The user's declared, inspectable model — the Declare step of the core loop.
 * Everything FocusDeck offers must trace back to an entry here (Hymah
 * North-Star §4: not a feed). Inferences never write here directly: they are
 * proposals until the user confirms them (Layer 4, see learn.ts).
 */
export const MODEL_VERSION = 1;
export const MAX_TRAP_APPS = 3; // Hymah v1: 2–3 designated trap apps, no more
export const REVIEW_CADENCE_BOUNDS = { min: 15, max: 240 } as const;

/** A decided inference (Class D): visible and deletable, acted on only once confirmed. */
export interface InferenceRecord {
  id: string;
  statement: string;
  status: "confirmed" | "rejected";
  decidedOn: string; // YYYY-MM-DD
}

/** A boundary question that was asked (max one per day, at boundaries only). */
export interface QuestionRecord {
  questionId: string;
  askedOn: string;
  answer: "yes" | "no" | "skipped";
}

export interface UserModel {
  version: typeof MODEL_VERSION;
  modes: Mode[];
  /** Per-app opt-in. FocusDeck structurally cannot see an app not listed here. */
  designatedApps: AppId[];
  trapApps: AppId[];
  intentions: ImplementationIntention[];
  queue: QueueItem[];
  /** The scheduled review moment, in minutes. */
  reviewEveryMinutes: number;
  /** A confirmed answer to "Should I stay quiet during your first build hour?" */
  quietFirstBuildHour: boolean;
  systemOneEnabled: boolean;
  /** Off by default: when on, aggregates + your declared words go to an LLM off the hot path. */
  systemTwoEnabled: boolean;
  inferences: InferenceRecord[];
  questions: QuestionRecord[];
}

export const DEMO_INTENTIONS: ImplementationIntention[] = [
  { id: "i-x-building", text: "When I open X during Building, show me my PR queue.", when: "opens-trap", app: "browser-x", mode: "building", then: "tasks", enabled: true },
  { id: "i-finish-building", text: "When an agent finishes while I'm building, batch it until my review moment.", when: "agent-finishes", mode: "building", then: "batch", enabled: true },
  { id: "i-review", text: "When my review moment arrives, show me the blocked agent first.", when: "review-moment", mode: "any", then: "blocked-agents", enabled: true },
  { id: "i-slack-writing", text: "When I reach for Slack while writing, show me what I said I'd write.", when: "opens-trap", app: "slack", mode: "writing", then: "intentions", enabled: true },
  { id: "i-any-trap", text: "When I open X or Slack while an agent runs, offer me the next thing on my list instead.", when: "opens-trap", mode: "any", then: "queue-top", enabled: true },
];

/** The demo queue: Hymah's seed items plus where each micro-action happens. Blocked agents are live, not declared. */
export const DEMO_MODEL_QUEUE: QueueItem[] = [
  ...DEMO_QUEUE.filter((item) => item.kind !== "blocked-agent").map((item): QueueItem => ({
    ...item,
    app: item.id === "q3" ? "slack" : "browser-docs",
  })),
  { id: "q5", kind: "intention", title: "Write the migration notes", microAction: "Open the notes and write the first heading", priority: 1, estimatedMinutes: 4, app: "notes" },
  { id: "q6", kind: "content-chunk", title: "Async Rust, chapter 3", microAction: "Read the first section (6 min)", priority: 1, estimatedMinutes: 6, app: "browser-docs" },
  { id: "q7", kind: "task", title: "Re-run the flaky integration suite", microAction: "Run it once in the terminal", priority: 3, estimatedMinutes: 3, app: "terminal" },
];

/** The demo model — every catalog app designated, so the demo works out of the box. */
export function createDemoModel(): UserModel {
  return {
    version: MODEL_VERSION,
    modes: MODES.map((mode) => ({ ...mode })),
    designatedApps: [...APP_IDS],
    trapApps: ["browser-x", "slack"],
    intentions: DEMO_INTENTIONS.map((i) => ({ ...i })),
    queue: DEMO_MODEL_QUEUE.map((q) => ({ ...q })),
    reviewEveryMinutes: 60,
    quietFirstBuildHour: false,
    systemOneEnabled: true,
    systemTwoEnabled: false,
    inferences: [],
    questions: [],
  };
}

/** A blank model for declaring your own: default modes, nothing designated, nothing queued. */
export function createBlankModel(): UserModel {
  return { ...createDemoModel(), designatedApps: [], trapApps: [], intentions: [], queue: [] };
}

const EVENT_KINDS: EventKind[] = ["app-switch", "notification", "agent-needs-input", "agent-finished"];
const WHENS: IntentionWhen[] = ["opens-trap", "agent-blocks", "agent-finishes", "notification", "review-moment", "enters-mode"];
const TARGETS: OfferTarget[] = ["queue-top", "blocked-agents", "tasks", "intentions", "content", "interests", "batch"];
const ITEM_KINDS: QueueItemKind[] = ["task", "intention", "content-chunk", "interest"];

/** Every problem with a model, in plain words. An empty list means it is valid. */
export function validateModel(model: UserModel): string[] {
  const problems: string[] = [];
  const modeIds = new Set(model.modes.map((m) => m.id));
  if (modeIds.size !== model.modes.length) problems.push("Two modes share the same id.");
  if (!modeIds.has(REVIEW_MODE_ID)) problems.push("The Reviewing agents mode is required — review moments switch into it.");
  for (const mode of model.modes) {
    if (!mode.label.trim()) problems.push("Every mode needs a name.");
    if (mode.interruptibleBy.includes("app-switch") || mode.ambiguous?.includes("agent-needs-input")) {
      problems.push(`${mode.label}: a blocked agent is never model-gated, and app switches never interrupt.`);
    }
  }
  if (model.trapApps.length > MAX_TRAP_APPS) problems.push(`Pick at most ${MAX_TRAP_APPS} trap apps — FocusDeck watches a few moments well, not everything.`);
  for (const app of model.trapApps) {
    if (!model.designatedApps.includes(app)) problems.push(`Trap app ${app} must be designated before FocusDeck can notice it.`);
  }
  for (const intention of model.intentions) {
    const where = `“${intention.text || "(untitled intention)"}”`;
    if (!intention.text.trim()) problems.push("Every intention needs your own words.");
    if (intention.mode !== "any" && !modeIds.has(intention.mode)) problems.push(`${where} refers to a mode that no longer exists.`);
    if (intention.then === "batch" && !BATCHABLE_WHENS.includes(intention.when)) problems.push(`${where}: only agent and notification moments can be batched.`);
    if (intention.when === "opens-trap" && intention.app && !model.trapApps.includes(intention.app)) {
      problems.push(`${where}: ${intention.app} is not one of your trap apps.`);
    }
  }
  const itemIds = new Set<string>();
  for (const item of model.queue) {
    if (itemIds.has(item.id)) problems.push(`Two queue items share the id ${item.id}.`);
    itemIds.add(item.id);
    if (!item.title.trim() || !item.microAction.trim()) problems.push("Every queue item needs a title and a smallest next step.");
  }
  if (model.reviewEveryMinutes < REVIEW_CADENCE_BOUNDS.min || model.reviewEveryMinutes > REVIEW_CADENCE_BOUNDS.max) {
    problems.push(`Review moments must be every ${REVIEW_CADENCE_BOUNDS.min}–${REVIEW_CADENCE_BOUNDS.max} minutes.`);
  }
  return problems;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const apps = (v: unknown): AppId[] => (Array.isArray(v) ? v.filter(isAppId) : []);
const kinds = (v: unknown): EventKind[] => (Array.isArray(v) ? v.filter((k): k is EventKind => EVENT_KINDS.includes(k)) : []);

/**
 * Load a model from untrusted storage. Unknown fields are dropped, invalid
 * entries are skipped, missing fields fall back to the demo defaults.
 * Returns null when the input is not a FocusDeck model at all.
 */
export function normalizeModel(raw: unknown): UserModel | null {
  if (!isObject(raw) || raw.version !== MODEL_VERSION) return null;
  const fallback = createDemoModel();
  const modes: Mode[] = Array.isArray(raw.modes)
    ? raw.modes.filter(isObject).map((m) => ({
        id: str(m.id),
        label: str(m.label, str(m.id)),
        allowedApps: apps(m.allowedApps),
        interruptibleBy: kinds(m.interruptibleBy),
        ambiguous: kinds(m.ambiguous).filter((k) => k !== "agent-needs-input"),
        isProtected: m.isProtected !== false,
        builtIn: m.builtIn === true,
        description: str(m.description),
      })).filter((m) => m.id)
    : fallback.modes;
  const intentions: ImplementationIntention[] = Array.isArray(raw.intentions)
    ? raw.intentions.filter(isObject).flatMap((i): ImplementationIntention[] => {
        const when = WHENS.find((w) => w === i.when);
        const then = TARGETS.find((t) => t === i.then);
        if (!when || !then || !str(i.id)) return [];
        return [{ id: str(i.id), text: str(i.text), when, app: isAppId(i.app) ? i.app : undefined, mode: str(i.mode, "any"), then, enabled: i.enabled !== false }];
      })
    : fallback.intentions;
  const queue: QueueItem[] = Array.isArray(raw.queue)
    ? raw.queue.filter(isObject).flatMap((q): QueueItem[] => {
        const kind = ITEM_KINDS.find((k) => k === q.kind);
        if (!kind || !str(q.id)) return [];
        return [{
          id: str(q.id), kind, title: str(q.title), microAction: str(q.microAction),
          priority: num(q.priority, 2), estimatedMinutes: num(q.estimatedMinutes, 5),
          app: isAppId(q.app) ? q.app : undefined, url: typeof q.url === "string" && q.url ? q.url : undefined,
        }];
      })
    : fallback.queue;
  return {
    version: MODEL_VERSION,
    modes: modes.length > 0 ? modes : fallback.modes,
    designatedApps: apps(raw.designatedApps),
    trapApps: apps(raw.trapApps).slice(0, MAX_TRAP_APPS),
    intentions,
    queue,
    reviewEveryMinutes: Math.min(REVIEW_CADENCE_BOUNDS.max, Math.max(REVIEW_CADENCE_BOUNDS.min, num(raw.reviewEveryMinutes, 60))),
    quietFirstBuildHour: raw.quietFirstBuildHour === true,
    systemOneEnabled: raw.systemOneEnabled !== false,
    systemTwoEnabled: raw.systemTwoEnabled === true,
    inferences: Array.isArray(raw.inferences)
      ? raw.inferences.filter(isObject).flatMap((r): InferenceRecord[] =>
          (r.status === "confirmed" || r.status === "rejected") && str(r.id)
            ? [{ id: str(r.id), statement: str(r.statement), status: r.status, decidedOn: str(r.decidedOn) }]
            : [])
      : [],
    questions: Array.isArray(raw.questions)
      ? raw.questions.filter(isObject).flatMap((r): QuestionRecord[] =>
          (r.answer === "yes" || r.answer === "no" || r.answer === "skipped") && str(r.questionId)
            ? [{ questionId: str(r.questionId), askedOn: str(r.askedOn), answer: r.answer }]
            : [])
      : [],
  };
}
