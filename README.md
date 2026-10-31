# FocusDeck

A combination product — explicitly **not a copy of the X-post dock concept and
not a port of Hymah**: Hymah's attention-reallocation engine (the soul) running
in the mode-based, agent-heavy desktop environment the X posts describe (the
environment). The combined product is defined in [PRODUCT.md](./PRODUCT.md);
the comparison that led to it is [ASSESSMENT.md](./ASSESSMENT.md); where
decision models play is [DECISION-MODELS.md](./DECISION-MODELS.md).

This repository holds the envisioned v1: the spine ASSESSMENT.md §6 calls for
(modes + deterministic classifier + offer surface, fed by a real sensor, with
blocked agents as the top offer tier, review cadence as a scheduled intent
moment, and a mode-relative 20-switch warning), the three Stage 0 spikes, and
the full core loop — Declare → Notice → Classify in mode → Offer or batch →
Learn → Show. It is a local-first web app: everything it knows stays in your
browser, and sensors on your machine report to it through a metadata-only
bridge. What is verified, what is a spike, and what could not be done here is
in [BUILD-NOTES.md](./BUILD-NOTES.md); how it fits together is in
[ARCHITECTURE.md](./ARCHITECTURE.md).

## The core loop, and where it lives

| Step | What FocusDeck does | Where |
|---|---|---|
| **Declare** | Your modes, which apps it may notice (per-app opt-in), 2–3 trap apps, mode-scoped implementation intentions in your own words, what you'd rather do, your review cadence | `/declare` · `src/lib/focus/model.ts`, `intentions.ts` |
| **Notice** | Sensors post metadata-only events to the bridge; a demo can replay a day; you can try a moment by hand | `sensors/` · `src/app/api/sensor` · `src/lib/bridge` |
| **Classify in mode** | Rules first; System One (a Jev stand-in) only for the ambiguous residue; the safe default on doubt. Your intentions and answers can only make it *quieter* | `src/lib/focus/policy.ts`, `decision.ts`, `classifier.ts` |
| **Offer or batch** | Three triggers (defection, interruption, mode transition), one offer engine; blocked agents become ageing **open loops**; review moments walk them oldest-first | `src/lib/focus/deck/` · `loops.ts` · `governor.ts` |
| **Learn** | Accepts, dismisses (sacred, silent) and skips with context; one question a day at a mode boundary; inferences that change nothing until you confirm | `src/lib/focus/learn.ts` · proposals on `/declare` |
| **Show** | The weekly honest mirror: cumulative evidence, a trend with a state word and no score, open-loop ageing, misses counted plainly | `/mirror` · `src/lib/focus/mirror.ts` |

## Screens

- **Now** (`/`) — the mode dock with a one-click pause; the one offer (your
  words verbatim, Accept *is* the next step and costs one tap, the same as Not
  now); today's question; open loops with their age; what's held for you;
  mode-relative counters with the 20-switch gauge; sources (sensor bridge, demo
  day, test moments); and the activity log of every decision and why.
- **Declare** (`/declare`) — your inspectable model, plus the proposals inbox.
- **Mirror** (`/mirror`) — the weekly honest mirror (demo history available).
- **What it sees** (`/sees`) — everything FocusDeck collects, what it never
  collects, what it has inferred, where it lives; export or delete everything.
- **Lab** (`/lab`) — the three questions PRODUCT.md says the stress test must
  answer, with live assumptions; the parallelism × cadence stress table; the
  decision models; the calibration spike; the original X-post day views.

## Run it

```bash
npm install
npm run dev     # http://127.0.0.1:3000 — bound to this machine on purpose
npm test        # vitest: engine, simulator, mirror, bridge, System Two, sensors
npm run lint
npm run build && npm start
```

On first run, pick **Look around with the demo model** to explore (it
designates every catalog app so the demo works), or **Declare my own**. To see
the loop without any sensor, start **Replay the X-post day** under Sources.

## Connect sensors

- **Claude Code** — a hook that reports when a session blocks on you, finishes,
  or resumes, without reading any message content:
  [`sensors/claude-code/README.md`](./sensors/claude-code/README.md).
- **macOS app switches** — an untested Stage 0 spike:
  [`sensors/macos/README.md`](./sensors/macos/README.md).
- **Anything else** — `POST /api/sensor/events` with `{kind, app, source?, at?}`
  and nothing more: [`sensors/README.md`](./sensors/README.md).

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `FOCUSDECK_SENSOR_TOKEN` | unset | When set, every client — sensors and the FocusDeck page (enter it under Sources) — must send `Authorization: Bearer <token>` |
| `FOCUSDECK_ALLOWED_HOSTS` | unset | Extra host names the bridge answers on (comma-separated). Loopback only otherwise. Set a token too |
| `ANTHROPIC_API_KEY` | unset | Lets System Two (opt-in, off the hot path) write the weekly paragraph and draft proposals. Without it FocusDeck uses its plain template |
| `FOCUSDECK_SYSTEM_TWO_MODEL` | `claude-opus-5-5` | The model System Two calls |

## Decision models

Rules decide first, for free and explainably; System One (TypeSafe's Jev is the
reference; a deterministic, key-free stand-in ships here) scores only the
ambiguous residue under our thresholds, from metadata only, and is pausable;
System Two (an LLM, opt-in) works off the hot path; and you confirm anything
learned. The calibration spike on `/lab` answers DECISION-MODELS.md's question
— is System One calibrated on *your* labeled events at the 0.8 threshold? —
for the stand-in today and for a real Jev adapter later.

## What the stress test says (under default assumptions)

The Lab answers PRODUCT.md's three questions from a policy-aware simulator.
These are consequences of assumptions you can move, not evidence; telemetry
settles them.

1. **Mode-scoping the offer** barely moves context switches on its own (about
   one a day); the gain comes from mode-scoped classification and batching
   (about 65% fewer context switches at 4 agents).
2. **A review cadence** does not close loops faster than reacting — it makes
   supervision cheaper per agent-hour (about 31% at a 60-minute cadence), at
   the price of agents idling while they wait (their throughput falls about
   60%). A trade-off, not a free win.
3. **An offer at the defection moment** beats the feed once it is accepted
   about 10% of the time — a low bar whose real-world clearance only telemetry
   can show (the Lab shows your measured rate once there is one).

## Layout

- `src/lib/focus/` — the engine, pure TypeScript, no UI: `types.ts`,
  `apps.ts`, `modes.ts`, `classifier.ts`, `decision.ts`, `policy.ts`,
  `intentions.ts`, `model.ts`, `offer.ts`, `loops.ts`, `governor.ts`,
  `learn.ts`, `metrics.ts`, `history.ts`, `mirror.ts`, `calibration.ts`; the
  live loop in `deck/`; the stress test in `policyConfig.ts`, `policySim.ts`,
  `policyAnalysis.ts`, `stress.ts`, `demoHistory.ts`; the original event
  traces in `simulator.ts` and `scenarios.ts`
- `src/lib/bridge/` — the sensor intake contract, trust rules, buffer
- `src/lib/systemTwo/` — System Two payloads (aggregates + declared words
  only), proposals, and the Claude client
- `src/lib/client/` — the browser store, persistence, demo replay, bridge
  polling, one-tab election
- `src/components/` — `shell/`, `deck/` (Now), `declare/`, `mirror/`, `sees/`,
  `lab/`, `charts/`, `ui/`, and the prototype's `focus/` panels
- `src/app/` — pages (composition only) and the API routes
- `sensors/` — reference sensors

Each file stays under 300 lines, concerns separated.
