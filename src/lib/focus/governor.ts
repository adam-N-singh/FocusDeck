/**
 * The frequency governor (Hymah Spec §3.2): how often FocusDeck may speak.
 * Dismiss is sacred — after one, the same kind of offer stays quiet for a
 * cool-off instead of re-asking. Proactive offers are capped per hour, and
 * the 20-switch warning is capped so it can never become a shame machine.
 */
export const GOVERNOR = {
  /** After a dismiss, no re-ask of the same trigger for this long. */
  coolOffMinutes: 10,
  maxProactiveOffersPerHour: 4,
  /** An unanswered offer quietly steps aside after this long (logged as a skip). */
  offerExpiryMinutes: 5,
  warningCooldownMinutes: 60,
  maxWarningsPerDay: 3,
} as const;

export type OfferTrigger = "defection" | "interruption" | "review-moment" | "mode-transition" | "warning";

/**
 * Offers FocusDeck volunteers. An interruption offer is different: your own
 * mode rule let that event through, so it is shown rather than governed.
 */
export const PROACTIVE_TRIGGERS: OfferTrigger[] = ["defection", "review-moment", "mode-transition", "warning"];

/** Only one offer shows at a time; a new one replaces the current one only at equal or higher priority. */
export const OFFER_PRIORITY: Record<OfferTrigger, number> = {
  interruption: 3,
  "review-moment": 2,
  "mode-transition": 2,
  warning: 1,
  defection: 1,
};

export interface GovernorState {
  coolOffUntil: Partial<Record<OfferTrigger, number>>;
  proactiveOfferTimes: number[];
  warningTimes: number[];
}

export const emptyGovernor = (): GovernorState => ({ coolOffUntil: {}, proactiveOfferTimes: [], warningTimes: [] });

export type GovernorVerdict = { ok: true } | { ok: false; reason: string };

export function governorAllows(gov: GovernorState, trigger: OfferTrigger, now: number): GovernorVerdict {
  if (!PROACTIVE_TRIGGERS.includes(trigger)) return { ok: true };
  const until = gov.coolOffUntil[trigger];
  if (until !== undefined && now < until) {
    return { ok: false, reason: `You set the last one aside — staying quiet for ${Math.ceil(until - now)}m more.` };
  }
  const lastHour = gov.proactiveOfferTimes.filter((t) => t > now - 60);
  if (lastHour.length >= GOVERNOR.maxProactiveOffersPerHour) {
    return { ok: false, reason: `Already offered ${lastHour.length} things this hour — that's the cap.` };
  }
  if (trigger === "warning") {
    if (gov.warningTimes.length >= GOVERNOR.maxWarningsPerDay) return { ok: false, reason: "The switch warning is capped for today." };
    const last = gov.warningTimes[gov.warningTimes.length - 1];
    if (last !== undefined && now - last < GOVERNOR.warningCooldownMinutes) return { ok: false, reason: "The switch warning already showed this hour." };
  }
  return { ok: true };
}

export function recordOfferShown(gov: GovernorState, trigger: OfferTrigger, now: number): GovernorState {
  if (!PROACTIVE_TRIGGERS.includes(trigger)) return gov;
  return {
    ...gov,
    proactiveOfferTimes: [...gov.proactiveOfferTimes.filter((t) => t > now - 60), now],
    warningTimes: trigger === "warning" ? [...gov.warningTimes, now] : gov.warningTimes,
  };
}

/** A dismiss starts a silent cool-off for that trigger. No penalty, no guilt copy, nothing else. */
export function recordDismiss(gov: GovernorState, trigger: OfferTrigger, now: number): GovernorState {
  if (!PROACTIVE_TRIGGERS.includes(trigger)) return gov;
  return { ...gov, coolOffUntil: { ...gov.coolOffUntil, [trigger]: now + GOVERNOR.coolOffMinutes } };
}
