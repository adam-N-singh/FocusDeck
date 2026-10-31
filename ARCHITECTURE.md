# FocusDeck — architecture

ASSESSMENT.md §6 sets the shape: keep the native/sensor layer thin, and let the
decision layer — modes, classification, offer selection — sit behind a minimal
bridge. Everything below follows from that, and from the Hymah constitution
the product inherits: replacement never restriction, an inspectable model,
content never collected, an honest mirror.

```
 sensors (thin, native)          sensor bridge (Next.js route handlers)       browser (local-first)
 ─────────────────────           ──────────────────────────────────────       ───────────────────────────────────────────
 Claude Code hook ──┐            POST /api/sensor/events                      DeckProvider (root layout)
 macOS app switches ├─ metadata ─▶  strict intake: {kind, app, source, at}  ◀─ polls GET /api/sensor/events?after=seq
 anything else ─────┘   only        any other field rejects the event          │   pushes designated apps (PUT config)
        ▲                           designated-app filter (defense in depth)   ▼
        │                           in-memory ring buffer                     store (useSyncExternalStore)
        └── GET /api/sensor/config ◀─ designated apps + bundle ids             │  live deck ── reduceDeck(action, model)
            (filter AT the sensor)                                             │  demo deck ── same reducer, virtual clock
                                                                               │  model, history ── localStorage only
                                     POST /api/system-two  ◀── opt-in, on demand: aggregates + your declared words
                                       Claude (Layer 3)          (never events), template on any failure
```

## The engine (`src/lib/focus/`)

Pure TypeScript with no UI, no clock and no I/O, so the whole loop is
replayable and unit-tested.

- **The declared model** (`model.ts`, `intentions.ts`, `apps.ts`, `modes.ts`):
  user-declared modes (built-ins can't be deleted — review moments switch into
  Reviewing agents), per-app designation, up to three trap apps, the queue, and
  mode-scoped implementation intentions stored verbatim. `validateModel` lists
  problems in plain words; `normalizeModel` loads untrusted storage safely.
- **The decision stack** (`classifier.ts` → `decision.ts` → `policy.ts`):
  1. guarding paused → pass through, logged only;
  2. your own "batch it" intentions;
  3. mode allow-lists + event kind; System One only for each mode's declared
     ambiguous residue (never a blocked agent); low confidence or a paused
     System One → the safe default (batch);
  4. confirmed answers (quiet first build hour).
  Steps 2 and 4 can only make FocusDeck quieter, never louder than the mode.
- **The deck** (`deck/`): one reducer, `reduceDeck(state, action, context)`.
  Actions are events, ticks, mode changes, accept/dismiss, pause, answers and
  labels. It produces open loops, held items, the one offer, signals, and the
  activity log. Offer builders (`offers.ts`) implement the three triggers;
  `flow.ts` holds presentation under the governor, review moments, and mode
  transitions; `summary.ts` derives counters and rolls a day over (open loops
  carry across midnight).
- **Learn** (`learn.ts`): one boundary question per day; hypotheses (Class D)
  derived by counting, inactionable until confirmed or rejected.
- **Show** (`history.ts`, `mirror.ts`): per-day records, then weeks with a
  state word, forgiveness, cumulative evidence and misses.
- **The stress test** (`policyConfig.ts`, `policySim.ts`, `policyAnalysis.ts`):
  a minute-by-minute simulation where behaviour responds to the policy, using
  common random numbers so every policy faces the identical day; `stress.ts`
  keeps the prototype's sweep API on top of it. `simulator.ts` remains the
  policy-independent event trace the demo replays.

## The bridge (`src/lib/bridge/`, `src/app/api/sensor/`)

`intake.ts` parses sensor payloads: four fields, opaque `source` ids, bounded
timestamps, at most 100 events a request. `trust.ts` answers on loopback only,
refuses cross-site browser requests (CSRF, DNS rebinding), requires JSON for
writes, and — once `FOCUSDECK_SENSOR_TOKEN` is set — requires the token from
every client. `store.ts` is a 1,000-event ring buffer on `globalThis`; until
the app has PUT its designated apps, it drops everything. Route handlers read
request data first, so Next.js never prerenders them.

## The browser (`src/lib/client/`, `src/components/`)

- **Why a provider in the root layout:** with Cache Components, Next.js hides
  pages on navigation (React `<Activity>`) and pauses their effects. The clock,
  bridge polling and a running demo must keep going on every screen, so they
  live in `DeckProvider`, which never unmounts.
- **Hydration:** the store's server snapshot is a fixed, clock-free default;
  the client hydrates from storage after mount. Nothing reads `Date.now()`,
  `Math.random()` or `localStorage` during server rendering.
- **One engine at a time:** a Web Lock elects one tab to run the deck, so
  sensor events are processed once and storage has one writer. Other tabs wait
  and take over when it closes; "Use here" steals the lock.
- **Demo isolation:** a demo runs in its own deck on a virtual clock. Sensor
  events still land in the live deck, and nothing from a demo reaches history.

## Invariants the tests pin

- A blocked agent is never suppressed: it is surfaced or batched as an open
  loop, and a reply in one session never closes another session's loop.
- Your declarations only make FocusDeck quieter; dismissing is free, silent,
  and starts a cool-off; one offer at a time; proactive offers are capped.
- An app that isn't designated is invisible end to end: sensor, bridge, deck.
- Content cannot enter: the intake schema has no field for it, and System
  Two's payloads are rebuilt server-side from an allow-list.
- Simulated time always sums to the day; lost time can't exceed it.
- Cumulative evidence never decreases; a dismissal is never a miss.
