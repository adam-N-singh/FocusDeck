# macOS sensor: app switches

> **Untested Stage 0 spike.** `FocusDeckSensor.swift` was written in a Linux
> environment with no Swift toolchain or AppKit. It has never been compiled or
> run, and could not even be type-checked here: the Swift toolchain download was
> blocked. Its AppKit symbols were checked against Apple's documentation, and
> nothing beyond that. The first run on a Mac *is* the spike.

This answers ASSESSMENT.md §6, Stage 0 spike (a): can a helper report
designated-app switches cheaply, with non-designated apps filtered out *at the
sensor*?

## Run

You need macOS with Xcode or the Command Line Tools (`xcode-select --install`),
and FocusDeck running with at least one desktop app designated (until then the
bridge's config is empty and the sensor sends nothing).

```sh
swift sensors/macos/FocusDeckSensor.swift
# or compile once for a faster start:
swiftc -O sensors/macos/FocusDeckSensor.swift -o focusdeck-sensor && ./focusdeck-sensor
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `FOCUSDECK_URL` | `http://127.0.0.1:3000` | Where the bridge is |
| `FOCUSDECK_SENSOR_TOKEN` | unset | Sent as `Authorization: Bearer <token>`. Needed when the server sets the same variable (it then gates reads too) |
| `FOCUSDECK_DEBUG` | unset | `1` prints each switch it sends |

You should see output like this:

```
FocusDeck sensor: reporting designated app switches to http://127.0.0.1:3000. Ctrl-C to stop.
FocusDeck sensor: watching claude-code, editor, terminal
```

Then switch between a few apps and look at what arrived:
`curl -s 'http://127.0.0.1:3000/api/sensor/events?after=0'`.

## How it works

1. It fetches `GET /api/sensor/config` at start and every 60 s, and builds a
   map from bundle id to FocusDeck app id. The bridge lists designated apps
   only, and the sensor checks `designatedApps` again anyway. If a refresh
   fails, the map is emptied: an app the sensor doesn't know is designated is
   not sent.
2. It observes `NSWorkspace.didActivateApplicationNotification` on
   `NSWorkspace.shared.notificationCenter`. This is event-driven, with no
   polling.
3. It maps `NSRunningApplication.bundleIdentifier`. Anything unmapped is
   dropped on the spot, and is never printed or sent.
4. Consecutive activations of the same app id collapse into one event. Drops
   don't reset this, so a trip through an undesignated app
   (editor → browser → editor) doesn't show up as a telltale repeat.
5. It POSTs `{"kind":"app-switch","app":"editor"}` as JSON, with the bearer
   token if one is set, a 2 s timeout, and fire-and-forget delivery.

## What it collects

It collects which **designated** app became active, as a FocusDeck catalog id.
The bridge stamps the time on receipt. That is all.

It never collects window titles, document names, URLs, tabs, keystrokes,
screen contents, a process list, or anything about an undesignated app, not
even that one was used (Privacy Class E).

## Permissions

None should be needed, and none should be granted to it:

- **No permission needed for what it uses.** Apple's reference pages for
  [`didActivateApplicationNotification`](https://developer.apple.com/documentation/appkit/nsworkspace/didactivateapplicationnotification)
  and [`NSRunningApplication.bundleIdentifier`](https://developer.apple.com/documentation/appkit/nsrunningapplication/bundleidentifier)
  list no permission or entitlement.
- **Not Accessibility, not Screen Recording**, and not Input Monitoring, Full
  Disk Access or Automation either. Those permissions gate exactly what this
  sensor refuses to read: window titles through the Accessibility API, or
  through `CGWindowListCopyWindowInfo`, whose window names macOS withholds
  without Screen Recording. Apple's
  [`kCGWindowName`](https://developer.apple.com/documentation/coregraphics/kcgwindowname)
  page doesn't state that last point. The evidence is third-party: a 2019 gist,
  [Detecting Screen Recording Permission in macOS Catalina](https://gist.github.com/chockenberry/164ab2d3dd76736f81c9e9eed63d81bf),
  infers the permission from whether other apps' window names are readable.
  If macOS ever prompts for either permission, something is wrong.
- **Local Network.** Per
  [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy),
  command-line tools run from Terminal are automatically allowed local network
  access. `launchd` *agents* are not, so this needs a fresh look if the sensor
  is ever packaged as a login agent.

## Known limitations

- **Browsers are invisible.** `browser-docs` and `browser-x` have no bundle ids
  in the catalog. Telling a docs tab from X needs the URL or the tab title,
  which a sensor must not read. Browser activations are therefore dropped like
  any undesignated app. Changing that means classifying without reading URLs or
  titles, or a Privacy-doc amendment first (DECISION-MODELS.md, "The Hymah
  constraint").
- **Claude Code in a terminal is `terminal`.** The catalog's `claude-code`
  bundle id is the Claude desktop app. Agent state comes from
  `sensors/claude-code`.
- **It reports switches, not state.** The app already in front when the sensor
  starts is reported only once you switch away and back.
- **Run-loop delivery is untested.** It is unverified whether a plain `swift`
  script receives activation notifications without an `NSApplication`. If the
  "watching" line appears but no switches ever do, add `_ = NSApplication.shared`
  before `RunLoop.main.run()`.
- **Cost is unmeasured.** It is event-driven, with one GET a minute, but Stage 0
  should still measure CPU and energy (Activity Monitor → Energy) over a real
  working day.
- **No retry.** A switch posted while the bridge is down is lost. This is
  deliberate: the sensor keeps no queue of your activity.
