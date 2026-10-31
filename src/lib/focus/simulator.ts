import type { AppId, FocusEvent, ModeId } from "./types";

/** Seeded PRNG (mulberry32) so a "day" is reproducible — essential for stress tests. */
export function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimulationConfig {
  seed: number;
  /** Parallel agents running — the variable the X post blames for the chaos. */
  parallelAgents: number;
  /** Working minutes to simulate. */
  durationMinutes: number;
  /** How often (minutes) you deliberately sit in Reviewing-agents mode. */
  reviewEveryMinutes: number;
}

const BUILD_APPS: AppId[] = ["editor", "terminal", "browser-docs", "editor", "terminal"];
const DISTRACTION_APPS: AppId[] = ["browser-x", "slack"];

/**
 * Simulate one agent-heavy day. While "Building", each parallel agent finishes
 * or blocks at random, pulling you to its app (a switch, often a context
 * switch), and waiting agents tempt a check of Slack/X — exactly the loop in
 * the post: "open X while the next [agent run finishes]".
 */
export function simulateDay(config: SimulationConfig): FocusEvent[] {
  const rng = createRng(config.seed);
  const events: FocusEvent[] = [];
  let id = 0;
  const push = (e: Omit<FocusEvent, "id">) => events.push({ ...e, id: `e${id++}` });

  for (let minute = 0; minute < config.durationMinutes; minute++) {
    const inReview = minute % config.reviewEveryMinutes < 10;
    const mode: ModeId = inReview ? "reviewing-agents" : "building";

    // Normal in-mode work: editor <-> terminal <-> docs.
    if (rng() < 0.55) {
      push({ atMinute: minute, kind: "app-switch", app: BUILD_APPS[Math.floor(rng() * BUILD_APPS.length)], label: "Work switch", modeAtEvent: mode });
    }

    // Each agent independently finishes / blocks / tempts a distraction check.
    for (let agent = 0; agent < config.parallelAgents; agent++) {
      const roll = rng();
      if (roll < 0.03) {
        const app: AppId = agent % 2 === 0 ? "claude-code" : "cursor-agent";
        push({ atMinute: minute, kind: "agent-needs-input", app, label: `Agent ${agent + 1} needs input`, modeAtEvent: mode });
        push({ atMinute: minute, kind: "app-switch", app, label: `Switch to Agent ${agent + 1}`, modeAtEvent: mode });
      } else if (roll < 0.05) {
        push({ atMinute: minute, kind: "agent-finished", app: "terminal", label: `Agent ${agent + 1} finished`, modeAtEvent: mode });
      } else if (roll < 0.065) {
        // Waiting-on-agent behaviour: fill the gap with Slack / X.
        const app = DISTRACTION_APPS[Math.floor(rng() * DISTRACTION_APPS.length)];
        push({ atMinute: minute, kind: "app-switch", app, label: app === "browser-x" ? "Opened X while waiting" : "Checked Slack while waiting", modeAtEvent: mode });
      }
    }

    if (rng() < 0.04) {
      push({ atMinute: minute, kind: "notification", app: "slack", label: "Slack notification", modeAtEvent: mode });
    }
  }
  return events.sort((a, b) => a.atMinute - b.atMinute);
}
