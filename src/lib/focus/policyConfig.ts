/**
 * The stress simulator's assumptions, kept apart from its mechanics so the
 * Lab can show them beside every result: which policies exist, how the
 * simulated day behaves, and what each kind of switch costs.
 */
export type PolicyId = "ad-hoc" | "hymah-unscoped" | "hymah-scoped" | "focusdeck" | "focusdeck-strict";

export interface PolicySpec {
  label: string;
  /** Offers at the defection moment: none, Hymah-style over everything, or scoped to the mode. */
  intercept: "none" | "unscoped" | "scoped";
  /** react: attend every agent ping. mode-rules: blocked agents interrupt Building, finishes wait. batch: all wait for review. */
  agents: "react" | "mode-rules" | "batch";
  notifications: "react" | "hold";
}

export const POLICIES: Record<PolicyId, PolicySpec> = {
  "ad-hoc": { label: "No FocusDeck — react to every ping", intercept: "none", agents: "react", notifications: "react" },
  "hymah-unscoped": { label: "Hymah-style intercept, unscoped", intercept: "unscoped", agents: "react", notifications: "react" },
  "hymah-scoped": { label: "Hymah-style intercept, mode-scoped", intercept: "scoped", agents: "react", notifications: "react" },
  focusdeck: { label: "FocusDeck — default Building rules", intercept: "scoped", agents: "mode-rules", notifications: "hold" },
  "focusdeck-strict": { label: "FocusDeck — agents wait for review", intercept: "scoped", agents: "batch", notifications: "hold" },
};

export const DEFAULT_BEHAVIOUR = {
  agentRunMeanMinutes: 25,
  agentBlockProbability: 0.6, // otherwise it finishes and needs a review
  attendMinutes: 2,
  defectBasePerMinute: 0.01,
  defectPerRunningAgent: 0.004, // the gaps parallel agents create: "open X while the next run finishes"
  feedMinutes: 6,
  notificationPerMinute: 0.04,
  checkNotificationProbability: 0.6,
  workSwitchPerMinute: 0.55, // the prototype's editor/terminal/docs rhythm
  /** Share of an unscoped queue's offers that live outside the current mode. */
  crossModeOfferShare: 0.5,
  crossModeTaskMinutes: 3,
};
export const DEFAULT_COSTS = { inModeSwitch: 0.5, contextSwitch: 4, interruption: 9, offerDecision: 0.25 };

export type Behaviour = typeof DEFAULT_BEHAVIOUR;
export type SimCosts = typeof DEFAULT_COSTS;

export interface PolicySimConfig {
  seed: number;
  durationMinutes: number;
  parallelAgents: number;
  policy: PolicyId;
  /** Review cadence for batching policies (9999 = never). */
  reviewEveryMinutes: number;
  /** P(accept) of an offer at the defection moment. */
  acceptRate: number;
  /** Override the policy's defection-moment behaviour (e.g. FocusDeck without offers). */
  intercept?: PolicySpec["intercept"];
  behaviour?: Partial<Behaviour>;
  costs?: Partial<SimCosts>;
}

export type LostCause = "agents" | "feed" | "notifications" | "work" | "offers";
export const LOST_CAUSES: LostCause[] = ["agents", "feed", "notifications", "work", "offers"];

export interface PolicyDay {
  totalSwitches: number;
  contextSwitches: number;
  interruptions: number;
  heldBack: number;
  lostMinutes: number;
  lostByCause: Record<LostCause, number>;
  focusMinutes: number;
  supervisionMinutes: number;
  agentRunMinutes: number;
  /** Share of agent-time spent running rather than waiting on you, 0..1. */
  agentUtilization: number;
  loopsOpened: number;
  meanWaitMinutes: number;
  maxWaitMinutes: number;
  openLoopMinutes: number;
  defections: number;
  offersShown: number;
  offersAccepted: number;
  reviews: number;
  warningCount: number;
  longestFocusStretchMinutes: number;
}
