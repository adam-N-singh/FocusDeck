# Sensors

Sensors are thin native programs that report metadata-only events to
FocusDeck's local sensor bridge. ASSESSMENT.md §6 sets the approach: spike the
sensor first, keep it thin, and let the tested decision layer sit behind a
minimal bridge.

Two rules hold for every sensor. Filtering happens *at the sensor*: what isn't
designated is never sent (ASSESSMENT.md §4.7). And content is never collected
(Privacy Class E).

| Sensor | Reports | Status |
| --- | --- | --- |
| [`claude-code/`](claude-code/README.md) | `agent-needs-input`, `agent-finished` and `agent-resumed`, from Claude Code hooks | Tested. Unit tests, plus end-to-end runs against the real bridge |
| [`macos/`](macos/README.md) | `app-switch` for designated desktop apps | **Untested spike.** Written without a Mac or a Swift toolchain |

## The bridge contract

The contract is defined in `src/lib/bridge/` (`intake.ts`, `trust.ts`,
`store.ts`).

**An event is `{ kind, app, source?, at? }` and nothing else.** Any other field
rejects the whole event.

| Field | Meaning |
| --- | --- |
| `kind` | `app-switch`, `notification`, `agent-needs-input`, `agent-finished` or `agent-resumed` |
| `app` | A catalog id from `src/lib/focus/apps.ts` (`editor`, `terminal`, `claude-code`, …). Sensors map native ids onto these |
| `source` | An opaque id matching `/^[A-Za-z0-9_-]{1,64}$/`. Hash native ids at the sensor |
| `at` | Epoch ms or ISO time, within the last day. Defaults to arrival time |

**Endpoints:**

- `POST /api/sensor/events` takes one event, an array, or
  `{"events":[...]}`, up to 100 per request.
- `GET /api/sensor/events?after=<seq>` returns events after a cursor. The app
  polls this.
- `GET /api/sensor/config` returns `designatedApps`, plus `apps: [{id,
  bundleIds}]` for designated apps only, so sensors can filter at the sensor.
  Until the app has PUT a config, the bridge drops everything.

**Trust:**

- The bridge answers on loopback only, unless `FOCUSDECK_ALLOWED_HOSTS` is set.
- Writes need `Content-Type: application/json`.
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

- **Map, or drop.** Map native ids onto catalog ids, and drop anything unmapped
  before it is logged or sent.
- **Build, don't copy.** Build events from constants and hashes, never by
  copying or filtering a native payload. A field the platform adds later then
  cannot leak.
- **Never get in the host's way.** Use short timeouts, no retries that queue up
  activity, and fail silently.
