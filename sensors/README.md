# Sensors (connectors)

Sensors are thin native programs that report metadata-only events to
FocusDeck's local sensor bridge. ASSESSMENT.md §6 sets the approach: spike the
sensor first, keep it thin, and let the tested decision layer sit behind a
minimal bridge.

Each sensor folder has a `manifest.json`, which lists it in the connector
marketplace on FocusDeck's **Connect** screen. There you can see what each
connector sends and never sends, copy setup steps already filled in for your
machine, and watch it go live. To build one, see
[CONTRIBUTING.md](CONTRIBUTING.md).

Two rules hold for every sensor. Filtering happens *at the sensor*: what isn't
designated is never sent (ASSESSMENT.md §4.7). And content is never collected
(Privacy Class E).

| Sensor | Reports | Status |
| --- | --- | --- |
| [`claude-code/`](claude-code/README.md) | `agent-needs-input`, `agent-finished` and `agent-resumed`, from Claude Code hooks | Tested. Unit tests, plus end-to-end runs against the real bridge |
| [`browser/`](browser/README.md) | `app-switch` for the browser categories (X, docs), matched by hostname inside the browser; only the category is sent | Tested in headless Chromium, against a stand-in bridge and once against the real one. Not yet run in a windowed browser, or on macOS or Windows |
| [`codex/`](codex/README.md) | `agent-needs-input` (approval), `agent-finished` and `agent-resumed`, from Codex CLI hooks; finished turns only through the older `notify` program | **Spike.** Checked against Codex's source (its docs site was unreachable). Unit and script tests; not run inside Codex |
| [`gemini-cli/`](gemini-cli/README.md) | `agent-needs-input` (tool confirmation), `agent-finished` and `agent-resumed`, from Gemini CLI hooks | Ready per Gemini CLI's docs. Unit and script tests; not run inside Gemini CLI |
| [`cursor/`](cursor/README.md) | `agent-finished` and `agent-resumed` for `cursor-agent`, from Cursor hooks. Cursor has no approval hook, so no `agent-needs-input` | **Spike.** Checked against Cursor's own example repos (its docs site was unreachable). Not run inside Cursor |
| [`github/`](github/README.md) | Review and deployment approval requests → `agent-needs-input`; CI → `agent-finished`; other notifications → `notification`. Polls your logged-in `gh` | Tested against a stub `gh`. Never reached the real API from here |
| [`macos/`](macos/README.md) | `app-switch` for designated desktop apps | **Untested spike.** Written without a Mac or a Swift toolchain |

## The bridge contract

The contract is defined in `src/lib/bridge/` (`intake.ts`, `trust.ts`,
`store.ts`).

**An event is `{ kind, app, source?, at?, via? }` and nothing else.** Any other
field rejects the whole event.

| Field | Meaning |
| --- | --- |
| `kind` | `app-switch`, `notification`, `agent-needs-input`, `agent-finished` or `agent-resumed` |
| `app` | An app id: built in (`src/lib/focus/apps.ts`: `editor`, `terminal`, `claude-code`, …) or introduced by a connector's manifest. Sensors map native ids onto these |
| `source` | An opaque id matching `/^[A-Za-z0-9_-]{1,64}$/`. Hash native ids at the sensor |
| `at` | Epoch ms or ISO time, within the last day. Defaults to arrival time |
| `via` | The connector's manifest id (`claude-code`, `macos`, …), so the Connect screen can show each connector's status |

**Endpoints:**

- `POST /api/sensor/events` takes one event, an array, or
  `{"events":[...]}`, up to 100 per request.
- `GET /api/sensor/events?after=<seq>` returns events after a cursor. The app
  polls this.
- `GET /api/sensor/config` returns `designatedApps`, plus `apps: [{id,
  bundleIds}]` for designated apps only, so sensors can filter at the sensor.
  It also returns `sites` (hostnames per designated browser category) for the
  browser connector. Until the app has PUT a config, the bridge drops
  everything.
- `GET /api/connectors` returns the marketplace catalog, plus per-connector
  counts (accepted, dropped, rejected, last event time), keyed by `via`.

**Trust:**

- The bridge answers on loopback only, unless `FOCUSDECK_ALLOWED_HOSTS` is set.
- Writes need `Content-Type: application/json`.
- Requests from a Chromium extension's origin (`chrome-extension://<id>`) are
  treated as a sensor's (the browser connector), never as the FocusDeck page.
  Web pages can't send that origin.
- If the server sets `FOCUSDECK_SENSOR_TOKEN`, every request needs
  `Authorization: Bearer <token>` — reads included, and the FocusDeck page too
  (enter the token under Sources). A same-origin header can be spoofed by any
  non-browser client, so once a token exists it is the only boundary.
- Without a token, only the app's own same-origin page may PUT the config: a
  best-effort guard on loopback, where every client is a local process.

## curl

```sh
# What may a sensor see? The designated apps and their native ids.
curl -s http://127.0.0.1:3000/api/sensor/config

# Post an event the way a sensor does.
# If the server has a token, add -H "authorization: Bearer $FOCUSDECK_SENSOR_TOKEN".
curl -s -X POST http://127.0.0.1:3000/api/sensor/events \
  -H 'content-type: application/json' \
  -d '{"kind":"agent-needs-input","app":"claude-code","source":"eaabdaa5d330d5d2"}'
# {"accepted":1,"dropped":0,"rejected":[],"configured":true}

# Content is refused, and the whole event goes with it (HTTP 422).
curl -s -X POST http://127.0.0.1:3000/api/sensor/events \
  -H 'content-type: application/json' \
  -d '{"kind":"notification","app":"slack","message":"lunch?"}'
# {"accepted":0,"dropped":0,"rejected":[{"index":0,"reason":"Field \"message\" is not accepted. …"}],"configured":true}

# Read what arrived after a cursor.
curl -s 'http://127.0.0.1:3000/api/sensor/events?after=0'
```

The two counts in the POST response mean different things:

- `dropped` counts well-formed events for apps that aren't designated. Before
  the app has configured the bridge, that is every event.
- `rejected` lists malformed events, each with a reason.

## Writing another sensor

See [CONTRIBUTING.md](CONTRIBUTING.md) for the rules every connector keeps, the
manifest format and the tests to write. In short:

- **Map, or drop.** Map native ids onto app ids, and drop anything unmapped
  before it is logged or sent.
- **Build, don't copy.** Build events from constants and hashes, never by
  copying or filtering a native payload. A field the platform adds later then
  cannot leak.
- **Never get in the host's way.** Use short timeouts, no retries that queue up
  activity, and fail silently.
- **Stay quiet for FocusDeck's own runs.** When `FOCUSDECK_INTERNAL=1` is set,
  send nothing.
