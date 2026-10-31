# Decision models in FocusDeck — where Jev and its alternatives play

## What Jev actually is (verified, not folklore)

Jev is **TypeSafe AI's first "System One" model** ([TypeSafe, "Introducing
System One Models & Jev", 15 Sep 2026](https://typesafe.ai/blog/introducing-system-one-models-and-jev)).
It is *not* a chat LLM and it does not generate text. You send it a **state**
(context, text or structured) plus **typed questions**, and it returns typed,
probabilistic answers in parallel:

- **Choice** — pick from predefined options (returns a probability per option)
- **Score** — rate against ordered levels (continuous score + distribution)
- **Noul** — yes/no statement (probability it is true)

Every answer carries a **calibrated confidence** (trained with "Reinforcement
Learning for Calibrated Decisions" — higher confidence is meant to actually
mean higher accuracy). TypeSafe's claims (vendor-reported, early access):
~70–500 ms end-to-end (vs. seconds for frontier LLMs), output tokens unmetered,
input ~$0.042 per million tokens, and no type errors / no string hallucination
by construction. In Thariq's prototype, Jev is the thing that "classifies
activity + notifications in real time & acts on them" — and the sharpest reply
in that thread asked exactly the right question: *"is that deterministic, or
are you constantly running [it]? bit of both?"*

**FocusDeck's answer is the same "bit of both" — with the order made explicit
and contractual.** A decision model is a layer, not the product.

## The stack (implemented in `src/lib/focus/decision.ts`)

### Layer 1 — Deterministic rules (decide by default)
Mode allow-lists + event kind (`classifier.ts`). Instant, free, fully
explainable ("Building allows agent-needs-input to interrupt"). Definitive
cases never touch a model: a blocked agent in Writing is *always* batched as an
open loop; a Slack ping in Building is *always* held. This layer owns every
case where Hymah's constitution speaks clearly — models do not get a vote on
identity-level rules.

### Layer 2 — System One decision model (Jev, for the ambiguous residue)
Only events the rules cannot settle reach Jev: e.g. a notification arriving
*inside* Comms mode (where interruptions are allowed but maybe not *this* one),
or an agent finishing while you build (news, but worth a switch?). FocusDeck
asks Jev-shaped questions over **event metadata only**:

- Noul: "Does this need the user right now?"
- Score: urgency
- Noul: "Is this a defection (trap-ward) rather than work?"

**Thresholds are our policy, not the model's** (act-now ≥ 0.80; batch below;
the pattern every Jev integration guide converges on — the model supplies
probabilities, your code supplies the values). **Low confidence (< 0.5) always
falls back to the safe action: batch for the review moment.** Nothing is ever
suppressed on a coin flip, and a blocked agent is never model-gated at all.

The repo ships `mockSystemOne` — a deterministic, key-free adapter with the
same shape — so the whole stack is testable offline today, and swappable for a
real Jev API call later without touching policy code. Jev is early access;
depending on it for v1's hot path before evaluating it would violate Hymah's
spike discipline. The spike question: on *your* labeled week of events, is
Jev's confidence actually calibrated at the 0.8 threshold?

### Layer 3 — System Two LLMs (never per-event)
A reasoning LLM (Claude-class; Hymah's stack already specifies Anthropic for
this) does slow, generative work off the hot path: chunking content into
impulse-sized offers, phrasing micro-commitments ("Open the PR"), synthesizing
the weekly honest mirror, distilling sources into the user model, and
*drafting* proposed new modes or intention edits — which reach the user as
proposals, never as silent changes. Running an LLM per notification would be
seconds of latency and real cost per event to answer a question Jev's class
answers in ~100 ms — and its free-text output would still need parsing and
validation. Wrong tool, wrong layer.

### Layer 4 — The user (confirmation gate)
Anything *learned* — a hypothesized interest, a suggested mode, a timing
pattern — is stored in the inspectable model and stays **inactionable until
the user confirms it** (Hymah North-Star §6, Privacy Class D). Decision models
may propose; only declared or confirmed model entries may act. Skip behavior
feeds this layer as signal (Hymah Spec §3.5), logged with context from day one.

## The Hymah constraint Jev must obey (read this before wiring the real API)

Hymah's privacy constitution (Privacy §2, Class E) says notification and
message **content is never collected, ever**. Thariq's prototype can let Jev
read notifications; the combined product may not — at least not by default.
So in FocusDeck, Jev's *state* is metadata: app, event kind, active mode,
timing, queue depth, sender *class* if the user declared one. The one content
exception that stays inside the constitution is the user's **own delegated
work**: agent events (session blocked / finished, PR state) are structured
state from the user's own fleet, not a third party's messages. If a future
version wants richer Jev states, that is a Privacy-doc amendment and a
"What It Sees" screen change first — architecture before capability, per
Hymah's Operating Instructions §8 ("when uncertain: ask").

## Alternatives, honestly compared

| Option | Latency / cost | Output | Where it wins here | Where it loses |
|---|---|---|---|---|
| Hand rules only | ~0 ms, free | Exact, brittle | Layer 1 (it *is* Layer 1) | Ambiguous residue needs endless hand-tuning |
| **Jev (System One)** | ~70–500 ms, very cheap (vendor claims) | Typed probabilities + calibrated confidence, no hallucinated strings | Layer 2: real-time routing at notification volume | Early access; calibration on *your* data unproven; vendor lock-in; metadata-only constraint limits its state |
| Small local classifier (embeddings / tiny model on-device) | Fast, free at runtime, private | Probabilities, weaker semantics | Privacy-max variant of Layer 2; works offline | Needs your labeled data; worse at nuanced "needs you?" judgments; another model to maintain |
| Frontier LLM per event | Seconds, real cost/event | Free text needing parse + validation | Nothing in the hot path | Latency, cost, hallucination surface, overkill — reserved for Layer 3 |
| Hybrid (this design) | Rules ~0 ms for most events; model only on residue | Typed, thresholded, audited | Matches the thread's "bit of both" and Hymah's "explicit before inferred" | More moving parts — justified only because each layer has a distinct job |

## Bottom line

Jev's role in this product is narrow and real: **the fast, typed, probabilistic
middle layer that turns "the rules ran out" into a calibrated bet, under
thresholds you own, with a safe fallback when it's unsure.** It does not set
policy, it does not learn the user, it does not write offers, and it never sees
content Hymah forbids. The LLM thinks slowly elsewhere; the rules guard the
constitution; the user ratifies anything learned. That division — not any
single model — is what makes the combination trustworthy enough to leave on.
