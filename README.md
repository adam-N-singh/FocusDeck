# FocusDeck

A combination product — explicitly **not a copy of the X-post dock concept and
not a port of Hymah**: Hymah's attention-reallocation engine (the soul) running
in the mode-based, agent-heavy desktop environment the X posts describe (the
environment). The combined product is defined in [PRODUCT.md](./PRODUCT.md).
See
[ASSESSMENT.md](./ASSESSMENT.md) for the full, revised comparison: it is now
based on Hymah's actual North-Star Vision, Platform Feasibility, Privacy &
Trust Architecture, v1 Product Spec, Agent Operating Instructions, and Stage
Handoff Prompts (supplied by the founder), mapped against the X posts that
inspired the twist. Headline finding: the developer version is almost literally
Hymah v2's "task-signal sources" plus a desktop mode system, promoted to the
spine — built here under Hymah's rules (replacement never restriction, offers
traceable to your own model, dismiss is sacred, nothing surveilled).

## What it does

- **Mode dock** — Building / Writing / Reviewing-agents / Comms / Idle, each with
  an app allow-list and a plain-English rule for what may interrupt it, plus a
  one-click pause.
- **Switch counter, made legible** — total app/tab switches split into in-mode
  switches vs. context switches, with an estimated refocus cost, a rolling
  20-switch warning, and your longest focus stretch.
- **The offer, Hymah-style** — your implementation intention shown back verbatim
  ("You said:…"), exactly one offer selected by Hymah's ordering (blocked agents
  → tasks → intentions → declared-interest fallback), micro-commitment framing,
  and friction asymmetry: Accept pre-loads the thing and never costs more taps
  than Dismiss, which is sacred and never penalized.
- **Deterministic-first classifier** — every notification/agent event is labelled
  `needs-you-now`, `batch-for-later`, or `suppress-in-mode`, with the rule that
  produced the label shown in a clear activity log. Blocked agents are never
  suppressed outright; they become countable **open loops**.
- **Stress-test simulator** — a seeded, reproducible simulated day. Sweep
  parallel-agent count × review cadence and read the estimated refocus minutes
  lost per 8-hour day before building any OS-level sensor.

## Decision models

Where TypeSafe's Jev and other models play — rules first, Jev (System One) for
ambiguous events only, LLMs off the hot path, the user confirming anything
learned — is designed in [DECISION-MODELS.md](./DECISION-MODELS.md) and
implemented in `src/lib/focus/decision.ts` with a deterministic mock adapter
(no API key needed to run or test).

## Run it

```bash
npm install
npm run dev     # http://localhost:3000 (or the port Next prints)
npm test        # vitest: classifier, metrics, and stress-sweep tests
npm run build
```

## Layout (each file < 300 lines, concerns separated)

- `src/lib/focus/types.ts` — domain types only
- `src/lib/focus/modes.ts` — mode definitions + cost model
- `src/lib/focus/classifier.ts` — deterministic notification/agent classifier
- `src/lib/focus/metrics.ts` — switch / interruption / open-loop aggregation
- `src/lib/focus/simulator.ts` — seeded simulated day generator
- `src/lib/focus/scenarios.ts` — the hand-authored "X-post day"
- `src/lib/focus/stress.ts` — parallelism × cadence stress sweep
- `src/components/focus/*` — ModeDock, MetricsPanel, EventTimeline, StressTable
- `src/app/page.tsx` — composition only

## Next steps toward a real product

1. Replace the simulator with OS-level app-switch telemetry (macOS first, per
   the quoted prototype) — keep the classifier and metrics layers unchanged.
2. Add open-loop ageing (how long each agent has been blocked) as the headline
   optimisation target alongside context switches.
3. Only then add a model-backed classifier for the ambiguous residue the
   deterministic rules cannot resolve — logged, pausable, and off the hot path.
