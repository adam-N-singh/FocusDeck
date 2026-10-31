# Is the X idea "basically Hymah, but for developers"? — Assessment (revised)

**Revised after reading the real Hymah docs** (North-Star Vision, Platform
Feasibility, Privacy & Trust Architecture, v1 Product Spec, Agent Operating
Instructions, Stage Handoff Prompts — supplied 30 Oct 2026, 12:01 PM
America/Guyana). The first version of this file was written without Hymah access
and used generic "transfer patterns"; this version replaces those guesses with
mappings to specific Hymah sections. Where the first version was wrong, §5 says so.

Short answer: **your judgement is correct about the skeleton, and understated
about the twist.** The X idea and Hymah share the same core loop almost
step-for-step. But the twist is not "same product, developer audience" — Hymah
already names developers as a target user (North-Star §3). The real twist is a
change of *trigger, interrupter, and platform* — and Hymah's own roadmap already
points at it.

**Product direction confirmed by the founder (30 Oct 2026, 12:04 PM
America/Guyana): not an exact copy of the X-post product, and not a Hymah port
— a combination of the two.** The combined product is defined in
[PRODUCT.md](./PRODUCT.md): Hymah's engine and constitution (Declare → Notice →
Offer → Learn → Show; replacement never restriction; inspectable model; honest
mirror) operating in the X posts' environment (desktop modes, parallel-agent
signals, mode-relative switch evidence), with genuinely new synthesis —
mode-scoped implementation intentions, three triggers feeding one offer engine,
and open loops batched to a deliberate review moment.

---

## 1. What Hymah actually is (from its docs)

Hymah is a **personal attention-reallocation companion** (North-Star §1): it
notices the moment a person is about to defect from their own priorities —
reflexively opening TikTok instead of reviewing the PR — and at exactly that
moment gently offers what they themselves declared they wanted. Its five-step
core loop (North-Star §5):

1. **Declare** — tasks/intentions, interests, content sources, trap apps,
   implementation intentions in the user's own words ("when I open TikTok during
   work hours, show me my PR queue").
2. **Notice** — the user opens a designated trap app (2–3 max in v1), or a
   scheduled intent moment arrives.
3. **Offer** — exactly one thing, sized to the moment, framed in the user's own
   words where possible. One tap to accept, one tap to dismiss.
4. **Learn** — accepts/dismisses/skips (with skip context) refine the model;
   max one check-in question per day, at boundaries only.
5. **Show** — weekly review: cumulative evidence + honest accounting of misses.

Its permanent exclusions (North-Star §4) are identity-level: **not a blocker**
(replacement, never restriction; dismissal is one tap and never penalized),
**not a feed** (every suggestion traceable to the user's inspectable model),
**not social**, **not surveillance** (app-level visibility only, per-app opt-in;
never screen/keystroke/message/notification *content*), **not a shame machine**
(no streaks, guilt, or urgency theater — but honest accountability is in scope).

The v1 mechanics (v1 Spec §3, Platform Feasibility): trap-app intercept on
Android (UsageStats + overlay; the reference implementation) and iOS (Screen
Time shield / Shortcuts pattern; constrained port), an offer surface obeying
*friction asymmetry as engineering law* (Accept never costs more taps than
Dismiss, the accepted thing arrives pre-loaded) and *micro-commitment framing*
("open the PR," not "do the code review"), a two-type queue (intentions/tasks +
LLM-chunked content), and a trend-based score (Climbing / Steady / Drifting,
no hero number, improvement-triggered forgiveness).

## 2. What the X idea is (from the posts)

- [@trq212](https://x.com/trq212/status/2115135857669881939): an AI-native macOS
  **dock with custom modes (writing, building)**; an agent customizes mode
  behavior and adds modes; a classifier classifies **activity + notifications in
  real time and acts on them**.
- [@fekdaoui](https://x.com/fekdaoui/status/2116181329033478249) quoting it:
  **506 app/tab switches in a day**, self-measured; parallel agents turned the
  day into "one long interruption" — an agent finishes in Slack, a Claude Code
  session needs an answer, X gets opened while waiting.
- Replies: "the **open loops are the disease**"; "the **20-switch warning**" is
  the useful part; "is that **deterministic, or constantly running a model**?";
  "I'd want a **one-click pause and a clear activity log**."

## 3. Verdict: where you're right, and where the twist is bigger than you said

### Right: the skeleton is Hymah's core loop

| Hymah (North-Star §5) | X / developer twist | Same? |
|---|---|---|
| Declare intentions + implementation intentions | Declare modes + what each mode allows | Yes — Declare, reshaped |
| Notice: trap-app open | Notice: activity/notification/agent event in a mode | Yes — Notice, more triggers |
| Offer one thing, sized to the moment | Classify and act: surface / batch / hold | Yes, with a new action set |
| Learn from accept/dismiss/skip | Learn from switches, answers, open loops | Yes |
| Show weekly evidence, honestly | Switch counts, warnings, focus stretches | Yes — Show, developer-flavored |

Anyone building the X product from scratch would reinvent Hymah's Declare →
Notice → Offer → Learn → Show loop within a month. Starting from Hymah's docs
is a genuine head start, not a metaphor.

### Bigger than "for developers": three real changes

1. **The trigger inverts.** Hymah fires on *defection* (opening a trap). The X
   product fires on *context* (which mode am I in, what just happened in it).
   Trap-open is a special case of mode-relative event classification — the
   developer version generalizes Hymah's Notice step from 2–3 designated apps
   to a whole working environment.
2. **The interrupter is your own delegated work.** Hymah's enemy is engineered
   feeds; the X product's enemy is agents returning at machine cadence. That
   creates the genuinely new unit Hymah doesn't have: the **open loop** — an
   agent blocked on you, which batching defers but never deletes. Hymah's queue
   holds *your* intentions; this queue also holds *agents' claims on you*.
3. **The platform flips.** Hymah is mobile-first (Android reference, iOS
   constrained port; desktop is explicitly out of v1 — Spec §5: no web app, no
   browser extension). The X product is a *macOS desktop dock*. The feasibility
   problems are mirror images: Hymah fights mobile OS sandboxing; the desktop
   version gets rich app-switch telemetry comparatively easily but must earn
   trust without an OS shield pattern to hide behind.

### The detail that settles it

Hymah's own roadmap already names this product. North-Star §10 (v2) lists
**"task-signal sources — feeds that resurface intentions rather than provide
content (a PR feed making 'review PR #42' timely again)."** A PR feed resurfacing
your review is one step from an agent feed resurfacing its blocked session.
The developer twist is, almost literally, *Hymah v2's task-signal sources +
a desktop mode system, promoted to the spine*. You didn't find a different
product wearing Hymah's clothes; you found Hymah's own future, arriving from
the desktop side.

## 4. Inspiration to pull from Hymah (now specific, not generic)

1. **Replacement, never restriction (North-Star §3–§4, Spec §3.2).** FocusDeck's
   first cut framed held notifications as "suppressed." Hymah's framing is
   better and is now adopted in the app: the guard *steps aside instantly*,
   dismissal is sacred (one tap, silent, no guilt copy), and held items are an
   *offer deferred*, always viewable — never a wall. If the developer version
   ever feels like a blocker, it has betrayed the parent product.
2. **Friction asymmetry as engineering law (Spec §3.3).** Accept ≤ taps of
   Dismiss, accepted thing arrives pre-loaded. Now implemented in FocusDeck's
   offer surface — and it's the correct answer to "I opened X while waiting":
   the good action must be easier than the distraction, not just nobler.
3. **Implementation intentions, verbatim (North-Star §5, Spec §3.1/§3.3).**
   "You said: when an agent finishes while I'm building, batch it until my
   review moment." The user's own calm-moment words, shown back at the hot
   moment. Now the spine of FocusDeck's offer panel.
4. **The offer-selection order (Spec §3.3).** Due/priority tasks → pinned
   intentions → short content → declared-interest fallback. Ported directly
   into `src/lib/focus/offer.ts` and unit-tested; the developer version adds
   "blocked agents" as a new top tier (see §5).
5. **Deterministic-first, honest-about-inference (North-Star §6; Privacy §2
   Class D).** Inferences are visible, deletable, and *inactionable until
   confirmed*. Combined with the X thread's "deterministic or constantly
   running a model?" — the answer Hymah already gives is: rules first, learning
   layered on explicit data, model only where rules run out. The pause button
   and activity log the thread demanded are, in Hymah terms, the **What Hymah
   Sees** surface (Privacy §4) and the frequency governor (Spec §3.2).
6. **The honest mirror, not a shame machine (North-Star §7, Spec §3.6–3.7).**
   Trend line + state word (Climbing / Steady / Drifting), cumulative evidence
   that only rises, misses admitted and counted, candor capped at one supportive
   statement per week. This is exactly how a "506 switches" counter should be
   *shown* — as a trend with forgiveness, not a daily guilt number.
7. **Privacy classes as architecture (Privacy §2, §7).** Class E (never
   collected: screen, keystrokes, notification/message *content*) maps to the
   desktop directly: a developer version may count *that* you switched to
   Slack, never what Slack showed you; and per Hymah's native-boundary rule,
   filtering happens at the sensor layer so the app layer *structurally cannot*
   see undesignated activity. Any desktop build that reads window titles or
   notification text by default has violated the family constitution.
8. **Skip-as-signal and the question cap (North-Star §6, Spec §3.5).** One
   question/day max, at boundaries, skips logged with context from day one
   because "data not collected cannot be retro-fitted." For the developer
   version, "should I stay quiet during your first build hour?" is a capture-
   and-modeling question — asked once, at a seam, never mid-flow.

## 5. What the first (Hymah-blind) assessment got wrong — corrected

- It guessed Hymah was "a general focus product" for a general audience.
  **Wrong:** Hymah already targets knowledge workers and developers
  (North-Star §3); the audience barely changes. What changes is trigger,
  interrupter, and platform (§3 above).
- It framed held notifications as "suppression." **Against Hymah's identity:**
  replacement never restriction, dismiss is sacred. FocusDeck's language and
  offer surface have been corrected accordingly.
- It treated a switch counter as a neutral sensor. **Hymah's privacy doc
  forbids the naive version:** only designated-app signals, coarse, local-first,
  inspectable. A desktop switch counter must be opt-in per app/agent surface,
  with a What-It-Sees screen, or it becomes the surveillance Hymah exists to
  refuse.
- It invented a generic "weekly review." Hymah's is specific (Spec §3.7):
  cumulative evidence + this week's trend + coming week, adult and quiet.
  FocusDeck's reporting should converge on that shape.

## 6. Recommended development plan for the developer twist

Borrow Hymah's staging discipline (Feasibility §6, Stage Handoffs): **spike the
sensor before finalizing the spec**, keep the native/sensor layer thin, and let
the decision layer (modes, classification, offer selection — already built and
tested in this repo) sit behind a minimal bridge.

1. **Stage 0 (desktop spikes):** (a) macOS app-switch telemetry — can a helper
   log designated-app switches at acceptable battery/CPU cost, filtering
   non-designated apps *at the sensor*? (b) agent-event intake — can Claude
   Code / Cursor / Slack events arrive as `agent-needs-input` /
   `agent-finished` without reading message content? (c) entitlement/privacy
   surface — draft the desktop What-It-Sees screen before any sensor ships.
2. **v1 spine:** modes + deterministic classifier + offer surface (this repo)
   fed by the real sensor; blocked agents as the new top offer tier; review
   cadence as a scheduled intent moment (Hymah Spec §3.1's secondary trigger,
   promoted); 20-switch warning computed *mode-relatively*.
3. **Deliberately not v1:** learned mode inference, content reading of any kind,
   adaptive question timing — each is Hymah v2 territory, and Hymah's staging
   bet applies verbatim: *if the intercept-and-offer moment doesn't work with
   explicit models, no amount of AI would have saved it — and we find that out
   cheaply.*

## 7. Risks specific to the twist

- **Open-loop guilt:** counting blocked agents can become the shame machine
  Hymah forbids. Mitigation is Hymah's own: trend + state word, forgiveness on
  improvement, one supportive nudge per week max (Spec §3.6).
- **Sensor creep:** desktop makes content access *easy*, which makes Class E
  discipline a choice rather than a platform constraint. The privacy boundary
  must be architectural (filter at the sensor), not a policy promise.
- **Supervision denial:** the reply thread's sharpest line — parallel agents
  "move the switching cost from doing the work to supervising it" — means the
  product must make supervision *cheaper* (batched, mode-timed, one-tap), not
  merely better counted. The stress sweep in this repo exists to test exactly
  that claim before building the sensor.
