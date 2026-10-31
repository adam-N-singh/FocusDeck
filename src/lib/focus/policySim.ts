import { WARNING_THRESHOLD } from "./modes";
import { contextSwitchesInWindow } from "./metrics";
import { DEFAULT_BEHAVIOUR, DEFAULT_COSTS, LOST_CAUSES, POLICIES, type Behaviour, type LostCause, type PolicyDay, type PolicySimConfig } from "./policyConfig";
import { createRng } from "./simulator";

export * from "./policyConfig";

/**
 * Policy-aware stress simulator. Unlike the event replay in simulator.ts, the
 * simulated person here *responds to the policy*: agents stall while they wait
 * on you, batching changes when you switch, an accepted offer replaces a feed
 * session. Time is accounted minute by minute, so lost time can never exceed
 * the day.
 *
 * Common random numbers: every policy faces the identical day — the same agent
 * runs, pings and impulses — and differs only in its decisions, so comparisons
 * measure the policy, not seed noise. Every number is a consequence of the
 * assumptions below, which the Lab shows beside the results (PRODUCT.md:
 * prove the moment cheaply, or find out cheaply that it does not work).
 */
type Stream = "impulse" | "notif" | "work" | "accept" | "cross" | "check";
const STREAMS: Stream[] = ["impulse", "notif", "work", "accept", "cross", "check"];

/** The day's randomness, fixed before any policy decides anything. */
function environment(seed: number, minutes: number, agents: number, b: Behaviour) {
  const draws = Object.fromEntries(
    STREAMS.map((stream, k) => {
      const rng = createRng(seed * 7919 + k);
      return [stream, Float64Array.from({ length: minutes }, () => rng())];
    }),
  ) as Record<Stream, Float64Array>;
  const agentRng = Array.from({ length: agents }, (_, i) => createRng(seed * 104729 + 31 * (i + 1)));
  const cycles = Array.from({ length: agents }, () => [] as { run: number; blocks: boolean }[]);
  const cycle = (agent: number, k: number) => {
    while (cycles[agent].length <= k) {
      const rng = agentRng[agent];
      cycles[agent].push({ run: Math.max(1, Math.round(-Math.log(1 - rng()) * b.agentRunMeanMinutes)), blocks: rng() < b.agentBlockProbability });
    }
    return cycles[agent][k];
  };
  return { draw: (stream: Stream, t: number) => draws[stream][t], cycle };
}

type Agent = { state: "running" | "blocked" | "finished" | "attending"; remaining: number; waitingSince: number; cycle: number };
type Activity = { kind: "attend" | "feed" | "review" | "slack" | "task"; remaining: number; agents: number[] };

export function simulatePolicyDay(config: PolicySimConfig): PolicyDay {
  const b = { ...DEFAULT_BEHAVIOUR, ...config.behaviour };
  const c = { ...DEFAULT_COSTS, ...config.costs };
  const spec = { ...POLICIES[config.policy], ...(config.intercept ? { intercept: config.intercept } : {}) };
  const env = environment(config.seed, config.durationMinutes, config.parallelAgents, b);
  const agents: Agent[] = Array.from({ length: config.parallelAgents }, (_, i) => ({ state: "running", remaining: env.cycle(i, 0).run, waitingSince: 0, cycle: 0 }));
  const day: PolicyDay = {
    totalSwitches: 0, contextSwitches: 0, interruptions: 0, heldBack: 0, lostMinutes: 0,
    lostByCause: { agents: 0, feed: 0, notifications: 0, work: 0, offers: 0 },
    focusMinutes: 0, supervisionMinutes: 0, agentRunMinutes: 0, agentUtilization: 0, loopsOpened: 0,
    meanWaitMinutes: 0, maxWaitMinutes: 0, openLoopMinutes: 0, defections: 0, offersShown: 0, offersAccepted: 0,
    reviews: 0, warningCount: 0, longestFocusStretchMinutes: 0,
  };
  const blockedWaits: number[] = [];
  const contextTimes: number[] = [];
  const batches = spec.agents !== "react";
  let debt = 0;
  let debtCause: LostCause = "work";
  let activity: Activity | null = null;
  let lastReview = 0;
  let heldNotifications = 0;
  let pendingNotification = false;
  let stretch = 0;

  const charge = (cost: number, cause: LostCause) => {
    if (cost > debt) debtCause = cause;
    debt = Math.max(debt, cost);
  };
  const addDebt = (cost: number, cause: LostCause) => {
    if (debt === 0) debtCause = cause;
    debt += cost;
  };
  const contextSwitch = (t: number, cause: LostCause, cost = c.contextSwitch) => {
    day.totalSwitches += 1;
    day.contextSwitches += 1;
    contextTimes.push(t);
    if (contextSwitchesInWindow(contextTimes, t) === WARNING_THRESHOLD) day.warningCount += 1;
    charge(cost, cause);
    stretch = 0;
  };
  const waitingAgents = (only?: "blocked") =>
    agents.flatMap((a, i) => ((only ? a.state === only : a.state === "blocked" || a.state === "finished") ? [i] : []))
      .sort((x, y) => agents[x].waitingSince - agents[y].waitingSince);
  const startAttending = (t: number, ids: number[]) => {
    for (const id of ids) {
      if (agents[id].state === "blocked") blockedWaits.push(t - agents[id].waitingSince);
      agents[id].state = "attending";
    }
  };
  const startReview = (t: number) => {
    const waiting = waitingAgents();
    // A deliberate mode transition, not a leak: it costs the refocus on return, but like the
    // live deck it isn't counted as a context switch — and agent to agent inside is in-mode.
    day.totalSwitches += 1 + waiting.length;
    charge(c.contextSwitch, "agents");
    stretch = 0;
    startAttending(t, waiting);
    day.reviews += 1;
    lastReview = t;
    const minutes = waiting.length * b.attendMinutes + (heldNotifications > 0 ? 1 : 0); // held pings: one glance
    heldNotifications = 0;
    activity = { kind: "review", remaining: Math.max(1, minutes), agents: waiting };
  };
  const attendOldest = (t: number, focused: boolean, only?: "blocked") => {
    const [oldest] = waitingAgents(only);
    if (oldest === undefined) return false;
    // Pulled out of focus it's an interruption; from a lull it's an ordinary context switch.
    if (focused) day.interruptions += 1;
    contextSwitch(t, "agents", focused ? c.interruption : c.contextSwitch);
    startAttending(t, [oldest]);
    activity = { kind: "attend", remaining: b.attendMinutes, agents: [oldest] };
    return true;
  };
  const goToFeed = (t: number) => {
    contextSwitch(t, "feed");
    activity = { kind: "feed", remaining: b.feedMinutes, agents: [] };
  };

  const decide = (t: number) => {
    const focused = debt <= c.inModeSwitch;
    const waiting = waitingAgents().length;
    const running = agents.filter((a) => a.state === "running").length;
    if (batches && t - lastReview >= config.reviewEveryMinutes && (waiting > 0 || heldNotifications > 0)) return startReview(t);
    if (spec.agents === "react" && attendOldest(t, focused)) return;
    if (spec.agents === "mode-rules" && attendOldest(t, focused, "blocked")) return; // Building lets blocked agents through
    // A ping you don't check right away is simply ignored — it isn't re-rolled every minute.
    const checkSlack = pendingNotification && env.draw("check", t) < b.checkNotificationProbability;
    pendingNotification = false;
    if (checkSlack) {
      contextSwitch(t, "notifications");
      activity = { kind: "slack", remaining: 1, agents: [] };
      return;
    }
    if (env.draw("impulse", t) < Math.min(0.06, b.defectBasePerMinute + b.defectPerRunningAgent * running)) {
      day.defections += 1;
      if (spec.intercept === "none") return goToFeed(t);
      day.offersShown += 1;
      addDebt(c.offerDecision, "offers");
      if (env.draw("accept", t) >= config.acceptRate) return goToFeed(t);
      day.offersAccepted += 1;
      if (batches && waiting > 0 && spec.intercept === "scoped") return startReview(t); // an early review instead of a leak
      if (waiting > 0 && attendOldest(t, false)) return; // the blocked agent first
      if (spec.intercept === "unscoped" && env.draw("cross", t) < b.crossModeOfferShare) {
        contextSwitch(t, "work");
        activity = { kind: "task", remaining: b.crossModeTaskMinutes, agents: [] };
        return;
      }
      day.totalSwitches += 1; // an in-mode next step: cheap
      addDebt(c.inModeSwitch, "work");
      return;
    }
    if (env.draw("work", t) < b.workSwitchPerMinute) {
      day.totalSwitches += 1;
      addDebt(c.inModeSwitch, "work");
    }
  };

  for (let t = 0; t < config.durationMinutes; t++) {
    agents.forEach((agent, i) => {
      if (agent.state !== "running") return;
      agent.remaining -= 1;
      day.agentRunMinutes += 1;
      if (agent.remaining > 0) return;
      agent.state = env.cycle(i, agent.cycle).blocks ? "blocked" : "finished";
      agent.waitingSince = t;
      if (agent.state === "blocked") day.loopsOpened += 1;
      if (spec.agents === "batch" || (spec.agents === "mode-rules" && agent.state === "finished")) day.heldBack += 1;
    });
    if (env.draw("notif", t) < b.notificationPerMinute) {
      if (spec.notifications === "hold") {
        heldNotifications += 1;
        day.heldBack += 1;
      } else pendingNotification = true;
    }

    if (!activity) decide(t);

    const current = activity as Activity | null;
    if (current) {
      current.remaining -= 1;
      if (current.kind === "feed") day.lostByCause.feed += 1;
      else if (current.kind === "slack") day.lostByCause.notifications += 1;
      if (current.kind === "feed" || current.kind === "slack") day.lostMinutes += 1;
      else if (current.kind === "task") day.focusMinutes += 1;
      else day.supervisionMinutes += 1;
      if (current.remaining <= 0) {
        for (const id of current.agents) {
          const cycle = agents[id].cycle + 1;
          agents[id] = { state: "running", remaining: env.cycle(id, cycle).run, waitingSince: 0, cycle };
        }
        activity = null;
        day.totalSwitches += 1; // back to the editor
        charge(c.contextSwitch, current.kind === "feed" ? "feed" : current.kind === "slack" ? "notifications" : current.kind === "task" ? "work" : "agents");
      }
      stretch = 0;
      continue;
    }
    const lost = Math.min(1, debt);
    debt -= lost;
    day.lostMinutes += lost;
    day.lostByCause[debtCause] += lost;
    day.focusMinutes += 1 - lost;
    stretch += 1;
    day.longestFocusStretchMinutes = Math.max(day.longestFocusStretchMinutes, stretch);
  }

  const unresolved = agents.filter((a) => a.state === "blocked").map((a) => config.durationMinutes - a.waitingSince);
  const waits = [...blockedWaits, ...unresolved];
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    ...day,
    lostMinutes: round1(day.lostMinutes),
    focusMinutes: round1(day.focusMinutes),
    lostByCause: Object.fromEntries(LOST_CAUSES.map((k) => [k, round1(day.lostByCause[k])])) as Record<LostCause, number>,
    meanWaitMinutes: waits.length > 0 ? round1(waits.reduce((s, w) => s + w, 0) / waits.length) : 0,
    maxWaitMinutes: Math.max(0, ...waits),
    openLoopMinutes: waits.reduce((s, w) => s + w, 0),
    agentUtilization: config.parallelAgents > 0 ? Math.round((1000 * day.agentRunMinutes) / (config.parallelAgents * config.durationMinutes)) / 1000 : 0,
  };
}
