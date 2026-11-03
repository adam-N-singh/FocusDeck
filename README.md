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
- **Connect** (`/connect`) — the connector marketplace (search, categories,
  what each connector sends and never sends, setup steps filled in for your
  machine, live status per connector) and the AI that runs System Two: your
  Claude, ChatGPT or Google subscription through its official CLI, an API key,
  or a local model.
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
designates every built-in app so the demo works), or **Declare my own**. To see
the loop without any sensor, start **Replay the X-post day** under Sources.

## Connect your apps

Open **Connect** (`/connect`). Every connector in `sensors/` appears there with
what it sends, what it never sends, and setup steps already filled in with
this machine's paths. Press **Add connector** to designate its apps, follow
the steps, run its test command, and watch its status turn live. FocusDeck
shows you commands; it never installs or runs anything itself.

- **Claude Code** — a hook that reports when a session blocks on you, finishes,
  or resumes, without reading any message content.
- **Browser sites** — a Chromium extension that tells X from docs by matching
  the tab's hostname against your site lists *inside the browser*. Only the
  category is sent.
- **macOS app switches** — an untested Stage 0 spike.
- **Your own** — a folder with a `manifest.json`, in `sensors/` or wherever
  `FOCUSDECK_CONNECTORS_DIR` points: [`sensors/CONTRIBUTING.md`](./sensors/CONTRIBUTING.md).

Every connector and its verification status is listed in
[`sensors/README.md`](./sensors/README.md).

## Connect your AI

System Two (opt-in, on demand, never per event) can run on:

- **Your subscriptions**, through each provider's own unmodified CLI, signed
  in as you: Claude Code (Claude Pro/Max), Codex CLI (ChatGPT plans), Gemini
  CLI (Google account). FocusDeck runs the CLI with no tools, in an empty
  folder, with the prompt on stdin, and never touches your login. Read the
  terms notes in [BUILD-NOTES.md](./BUILD-NOTES.md#ai-providers-and-their-terms)
  first.
- **API keys**: Anthropic (official SDK), OpenAI, Gemini, OpenRouter, or any
  OpenAI-compatible endpoint. Keys stay in the server's environment.
- **A model on this machine**: Ollama or LM Studio.

Pick one under **Connect → AI for System Two**, and press **Test**. Whichever
you choose receives the same sanitized payload — weekly aggregates and your
own declared words, never anything a sensor observed.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `FOCUSDECK_SENSOR_TOKEN` | unset | When set, every client — sensors and the FocusDeck page (enter it under Sources) — must send `Authorization: Bearer <token>` |
| `FOCUSDECK_ALLOWED_HOSTS` | unset | Extra host names the bridge answers on (comma-separated). Loopback only otherwise. Set a token too |
| `FOCUSDECK_CONNECTORS_DIR` | unset | Extra folders of connectors (each `<folder>/manifest.json`), separated by `:` (`;` on Windows) |
| `FOCUSDECK_DIR` | the working directory | The FocusDeck folder that setup steps refer to |
| `ANTHROPIC_API_KEY` | unset | System Two on the Anthropic API (official SDK) |
| `FOCUSDECK_SYSTEM_TWO_MODEL` | `claude-opus-5-5` | The model the Anthropic provider calls |
| `OPENAI_API_KEY` · `FOCUSDECK_OPENAI_MODEL` | unset · `gpt-5.5` | System Two on OpenAI's API |
| `GEMINI_API_KEY` · `FOCUSDECK_GEMINI_MODEL` | unset · `gemini-3.8-flash` | System Two on the Gemini API (OpenAI-compatible endpoint) |
| `OPENROUTER_API_KEY` · `FOCUSDECK_OPENROUTER_MODEL` | unset · `openai/gpt-5.2` | System Two through OpenRouter |
| `FOCUSDECK_OLLAMA_URL` · `FOCUSDECK_OLLAMA_MODEL` | `http://127.0.0.1:11434/v1` · `gpt-oss:20b` if installed, else your first model | A local model through Ollama |
| `FOCUSDECK_LMSTUDIO_URL` · `FOCUSDECK_LMSTUDIO_MODEL` | `http://127.0.0.1:1234/v1` · your first model | A local model through LM Studio |
| `FOCUSDECK_OPENAI_COMPAT_BASE_URL` · `_API_KEY` · `_MODEL` | unset | Any other OpenAI-compatible endpoint |
| `FOCUSDECK_CLAUDE_CLI_MODEL` · `FOCUSDECK_CODEX_CLI_MODEL` · `FOCUSDECK_GEMINI_CLI_MODEL` | the CLI's own default | Model for each subscription CLI |
| `FOCUSDECK_CLAUDE_CLI_PATH` · `FOCUSDECK_CODEX_CLI_PATH` · `FOCUSDECK_GEMINI_CLI_PATH` | found on `PATH` | Where each CLI lives, if not on `PATH` |

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
- `src/lib/bridge/` — the sensor intake contract, trust rules, buffer, and
  per-connector status
- `src/lib/connectors/` — the connector manifest format and validator, and the
  catalog loader behind the marketplace
- `src/lib/systemTwo/` — System Two payloads (aggregates + declared words
  only), proposals, the task prompts (`tasks.ts`), and one adapter per kind of
  provider: Anthropic SDK (`claude.ts`), OpenAI-compatible HTTP
  (`openaiCompatible.ts`), subscription CLIs (`cli.ts`), chosen in
  `providers.ts`
- `src/lib/client/` — the browser store, persistence, demo replay, bridge
  polling, one-tab election
- `src/components/` — `shell/`, `deck/` (Now), `declare/`, `connect/`,
  `mirror/`, `sees/`, `lab/`, `charts/`, `ui/`, and the prototype's `focus/`
  panels
- `src/app/` — pages (composition only) and the API routes
- `sensors/` — the connectors, each with a `manifest.json`

Each file stays under 300 lines, concerns separated.
