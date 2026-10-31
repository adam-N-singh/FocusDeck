# FocusDeck — the combined product (working title)

**This is not a copy of the X-post product, and not a port of Hymah.**
It is a combination: Hymah's attention-reallocation engine, running in the
environment the X posts describe — desktop, mode-based, agent-heavy work.

## Definition in one paragraph

FocusDeck is a mode-aware attention companion for people who supervise
parallel agents on a desktop. In calm moments you declare what matters —
intentions, tasks, interests, trap apps, and the modes you work in — exactly as
in Hymah. From then on, FocusDeck notices two kinds of moments Hymah and the X
product each saw only half of: the *defection moment* (you reflexively open a
trap app, or open X while an agent runs — Hymah's original trigger) and the
*interruption moment* (an agent finishes, blocks, or a notification lands while
you are in a protected mode — the X product's trigger). Both moments feed one
offer engine: your implementation intention in your own words, one pre-loaded
micro-action, one tap to accept, one tap to dismiss. What cannot be offered now
without breaking your mode becomes an **open loop**, batched to a deliberate
review moment. Weekly, you get Hymah's honest mirror: cumulative evidence, a
trend with a state word, and the misses counted plainly.

## What comes from which parent

| From Hymah (the soul) | From the X posts (the environment) | New in the combination |
|---|---|---|
| Declare → Notice → Offer → Learn → Show loop | Modes: Building / Writing / Reviewing-agents / Comms | **Mode-scoped implementation intentions**: "When I open X *during Building*, show me…" |
| Replacement, never restriction; dismiss is sacred | Real-time classification of activity + notifications | **Three triggers, one offer engine**: defection, interruption, mode transition |
| Offer = your intention, micro-framed, friction asymmetry | Agent events as first-class signals | **Open loops**: blocked agents as a batched, ageable queue — Hymah's queue holding *agents' claims on you*, not just your claims on yourself |
| Privacy constitution: Class E never collected, inspectable model, designated-app signals only, filtered at the sensor | Switch counting as evidence ("506 times yesterday") | **Mode-relative counting**: a switch inside Reviewing-agents is work; the same switch inside Writing is a leak — the counter serves the honest mirror, never surveillance |
| Honest mirror: trend + state word, cumulative evidence, admitted misses | The 20-switch warning | **The warning, Hymah-ified**: a supportive, mode-relative signal ("20 context switches in this build hour — want a review moment?"), capped, never shaming |
| Task-signal sources (Hymah v2 roadmap) | Parallel-agent supervision | Task-signal sources promoted to the spine: PR feeds and agent fleets *are* the signal layer |

## The combined core loop

1. **Declare** — intentions, tasks, interests, trap apps, modes, review
   moments, and mode-scoped implementation intentions, in your own words.
2. **Notice** — a trap app opens, an agent finishes/blocks, a notification
   lands, or a scheduled review/mode moment arrives.
3. **Classify in mode** — deterministic rules first (mode allow-lists, event
   kind); a System One decision model (TypeSafe's Jev) only for ambiguous
   residue, under our thresholds, metadata-only; every decision logged.
   Full design: [DECISION-MODELS.md](./DECISION-MODELS.md).
4. **Offer or batch** — offer now if it fits the mode; otherwise batch it as an
   open loop for your review moment. The user is never blocked from anything.
5. **Learn** — accepts, dismisses (sacred, silent), and skips with context;
   max one question per day, at boundaries only.
6. **Show** — weekly honest mirror: cumulative evidence, trend + state word,
   open-loop ageing, misses admitted. Private, trend-oriented, recoverable.

## Explicitly NOT being built

- **Not the X product**: no macOS dock replica, no agent that invents modes
  autonomously from day one, no always-on model classifying everything.
  Modes here are user-declared first (Hymah's "explicit before inferred").
- **Not Hymah-the-mobile-app**: no trap-app shield/overlay port, no mobile
  onboarding clone. Hymah contributes its engine and constitution, not its UI.
- **Not a blocker, feed, or surveillance tracker** (Hymah North-Star §4):
  nothing is ever prevented, nothing is recommended that does not trace to the
  user's own inspectable model, and window content / notification text is
  never read (Class E).

## The questions the stress test must answer

1. Does mode-scoping the offer reduce *context* switches (not just total
   switches) versus an unscoped Hymah-style intercept?
2. Does a scheduled Reviewing-agents cadence clear open loops faster than
   ad-hoc checking — i.e., does it make supervision cheaper, or only tidier?
3. At the defection moment ("opened X while waiting"), is a Hymah offer
   accepted often enough to beat the feed — the original Hymah bet, replayed
   in the exact gap parallel agents create?

If (1) and (2) fail in simulation and later in telemetry, the combination has
no advantage over its parents and should be simplified back — that falsifiability
is inherited from Hymah's staging bet: prove the moment cheaply, or find out
cheaply that it does not work.
