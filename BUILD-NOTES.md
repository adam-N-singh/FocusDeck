# Build notes

How the prototype in this repository became the application PRODUCT.md and
ASSESSMENT.md describe: what was built, the judgment calls made along the way,
what was wrong in the prototype and fixed, and — most important — what could
not be done or verified in the build environment (a Linux container with no
macOS, no Swift toolchain, and no Anthropic or TypeSafe credentials).

The original upload is preserved unmodified as the first commit
(`Import FocusDeck codebase from uploaded archive`, from source commit
`49e35403`). Everything after it is reviewable commit by commit.

## Envisioned → built

| Envisioned (where the docs say it) | Built | Status |
|---|---|---|
| Declare: intentions, tasks, interests, trap apps, modes, review moments, mode-scoped implementation intentions (PRODUCT core loop 1) | `/declare`, `model.ts`, `intentions.ts` | Done |
| Notice: defection, interruption, mode-transition moments (PRODUCT core loop 2) | sensor bridge, Claude Code hook, demo replay, test moments, `deck/` | Done (macOS sensor: spike) |
| Classify in mode: rules first, System One for residue only, every decision logged (core loop 3, DECISION-MODELS) | `policy.ts`, `decision.ts`, activity log | Done, with a stand-in for Jev |
| Offer or batch; open loops batched to a review moment; never blocked (core loop 4) | offer engine, open loops, review moments, held items | Done |
| Learn: accepts, sacred dismisses, skips with context; one question a day at boundaries (core loop 5) | signals, `learn.ts`, proposals inbox | Done |
| Show: weekly honest mirror (core loop 6, ASSESSMENT §4.6) | `/mirror`, `mirror.ts` | Done |
| Friction asymmetry; micro-commitment framing; "You said:" verbatim (ASSESSMENT §4.2–4.3) | `OfferCard` | Done |
| Frequency governor; the 20-switch warning, Hymah-ified (PRODUCT table) | `governor.ts`; capped, supportive, mode-relative | Done |
| One-click pause and a clear activity log (the X thread) | mode dock, activity log | Done |
| What-It-Sees screen before any sensor ships (ASSESSMENT §6, spike c) | `/sees` | Done |
| Agent-event intake without message content (spike b) | `sensors/claude-code` | Done, tested end to end against the bridge |
| macOS app-switch telemetry filtered at the sensor (spike a) | `sensors/macos` | **Untested spike** — see below |
| Open-loop ageing as the headline target (README next step 2) | `loops.ts`, Now, mirror | Done |
| Model-backed classifier for the residue — logged, pausable, off the hot path (README next step 3) | System One toggle, `buildSystemOneState`, calibration spike | Seam + harness done; real Jev not wired (below) |
| System Two for synthesis and proposed modes/edits, as proposals (DECISION-MODELS Layer 3) | `src/lib/systemTwo`, `/api/system-two` | Done; not exercised against the live API (below) |
| The stress test answers PRODUCT's three questions | `policySim.ts`, `policyAnalysis.ts`, `/lab` | Done — under stated assumptions |
| Deliberately not v1: learned mode inference, content reading, adaptive question timing (ASSESSMENT §6) | — | Not built, by design |

## Problems found in the prototype, and fixed

- **The stress test could not answer its own question.** Its open loops were
  0 in every cell (the simulator only used modes where blocked agents always
  interrupt), review moments were billed as 9-minute interruptions — so
  reviewing more often looked *worse* — lost minutes exceeded the day (2,145
  "lost" minutes in a 480-minute day at 8 agents), and simulated behaviour
  never responded to the policy. Replaced by a policy-aware simulator with
  minute-by-minute accounting and common random numbers; the prototype's
  `runStressSweep` API and tests now run on it.
- **Metrics charged agent events in Reviewing agents as interruptions**,
  contrary to the cost model's own definition ("while in a protected mode").
  Modes now say whether they are protected; attending in an unprotected mode
  counts as the work.
- **Light mode rendered the title invisible**: the page background switched to
  white while every component used dark-theme text. The theme is now dark
  throughout.

Two bugs were found during the build itself and fixed: replying in one Claude
Code session could close another session's open loop, and with a sensor token
set, a spoofed `Sec-Fetch-Site` header skipped it.

## Judgment calls worth a second look

- **Modes are user-declared.** `ModeId` widened from five fixed ids to any
  string; the five built-ins can be edited but not deleted.
- **Intentions only make FocusDeck quieter.** A "batch it" intention can hold
  something the mode would let through; nothing can make it louder than the
  mode. A blocked agent it batches still waits as an open loop.
- **Defection offers are mode-scoped**: items whose next step happens in an
  app belonging to the current mode come first. When agents are waiting in a
  mode that holds them, the offer is an early review moment rather than a leak.
- **A review moment is not a context switch** — it's a deliberate mode
  transition — but it still costs the refocus on return.
- **The demo model designates every app** so the demo works; first run makes
  the choice explicit (demo model, or declare your own with nothing
  designated).
- **The mirror's state word** weighs context switches per focus hour, mean
  agent wait, and acceptance at defection moments, with floors so small
  absolute changes don't swing it; a climb forgives the drift before it.
  Dismissals are never misses.
- **The Claude Code hook** maps only permission and elicitation notifications
  to "needs your answer". `idle_prompt` repeats every finish 60 s later and
  would turn each finished task into a fake open loop.
- **The server binds to 127.0.0.1** (`npm run dev` / `npm start`), and a
  configured token is required from every client.
- **System Two** calls `claude-opus-5-5` with an explicit effort and
  server-side refusal fallback enabled (`fallbacks: "default"`); set
  `FOCUSDECK_SYSTEM_TWO_MODEL` to change the model.
- **The app catalog is fixed** at the nine apps the prototype used.

## Couldn't be done or verified here

These are documented rather than solved, as asked; each says what it needs.

1. **The macOS sensor has never been compiled or run.** There is no macOS or
   Swift toolchain in the build container, and downloading one was blocked.
   The AppKit names were checked against Apple's documentation, but it needs a
   first run on a Mac (`swift sensors/macos/FocusDeckSensor.swift`). Its claim
   that it needs no Accessibility or Screen Recording permission rests on
   secondary sources.
2. **Telling "X in a browser" from "docs in a browser" needs the URL**, which
   no sensor here reads. A browser extension could match designated sites
   locally and emit only the category — but Hymah's v1 spec excludes browser
   extensions, so whether that fits is a product decision. Until then, the two
   browser categories only arrive from manual events or a custom sensor.
3. **No real Jev (TypeSafe System One) adapter.** Jev is early access, and no
   API documentation or key was available. The seam is ready: an adapter type,
   a metadata-only `buildSystemOneState` that defines exactly what a real call
   may send, and the calibration spike to evaluate it on your labels before it
   touches the hot path.
4. **System Two was not run against the live Claude API** — there were no
   credentials, and a call spends real money. Its request shape was written
   against the installed `@anthropic-ai/sdk` types and is tested with a fake
   client (answers, refusals, missing credentials, malformed JSON). Without a
   key, the template is what runs.
5. **The Claude Code hook was not run inside a live Claude Code session.** It
   was tested against the documented hook input shapes and end to end against
   the bridge. Background sessions in agent view are undocumented.
6. **The Hymah source documents are not in this repository.** Everything Hymah
   here follows ASSESSMENT.md's summaries. Privacy classes D and E are named
   there; classes A–C are not, so the What-it-sees screen uses its own labels
   for them.
7. **The bridge is in memory and single-process.** That suits a local
   companion, but it is not durable and won't work on serverless hosting.
8. **One-tab handover can lose under half a second of state** if another tab
   steals the lock mid-write.
9. **Simulation is not evidence.** The Lab's three answers are consequences of
   the assumptions in `policyConfig.ts`; telemetry settles the questions.

## Next steps

1. Run the macOS sensor on a Mac and fix whatever the first compile reports.
2. Install the Claude Code hook and use FocusDeck for a week with guarding
   paused, to get a baseline (ASSESSMENT.md: instrument first, intervene second).
3. Replace the simulator's assumptions with that week, then re-read the three
   questions on `/lab`; label ambiguous events so System One's calibration is
   measured, not assumed.
4. Decide on the browser-category sensor (note 2).
5. Wire a real Jev adapter behind the existing seam, and keep it off the hot
   path until the calibration spike says it has earned its place.
