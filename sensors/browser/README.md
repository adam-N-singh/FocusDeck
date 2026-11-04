# Browser connector: site switches

This is a Manifest V3 extension for Chromium browsers: Chrome, Edge, Brave and
Arc. It tells FocusDeck when you switch to one of your X or docs sites, and
says only which category. It never sends a URL, a title or a hostname.

FocusDeck's trap app usually lives in a browser tab. Telling X from docs needs
the tab's hostname, and the privacy rule (Class E) forbids sending URLs. So the
extension fetches your site lists from FocusDeck and matches the active tab's
hostname against them *inside the browser*. Then it discards the hostname and
sends only the category. BUILD-NOTES.md (note 2) sketched this approach.

| File | Role |
| --- | --- |
| `extension/manifest.json` | The MV3 manifest: three permissions, and FocusDeck on this machine |
| `extension/background.js` | Service worker: triggers, config refresh, de-dup, POST |
| `extension/matcher.js` | Pure: tab URL → hostname → category, the site lists, de-dup, the event |
| `extension/settings.js` | Pure: FocusDeck's URL (this machine only) and the token |
| `extension/options.html`, `options.js` | Options page: URL, token, and what it is watching |
| `extension/icons/` | `icon.svg`, and the PNGs rendered from it |
| `manifest.json` | The connector's entry in FocusDeck's marketplace |
| `matcher.test.ts` | Vitest: matching, lookalikes, de-dup, designation, payload, settings, manifests |
| `e2e.test.ts` | Vitest + Playwright: the real extension in headless Chromium, against a stand-in bridge |

## What is sent

```json
{"kind":"app-switch","app":"browser-x","via":"browser-extension"}
```

Every event has exactly these three fields, plus an
`Authorization: Bearer <token>` header if you saved a token. The bridge stamps
the time when the event arrives.

- **`app`** is `browser-x` or `browser-docs`. The extension takes it from its
  own constants, never from the config or the tab.
- **When:** the active tab of the focused window switches to a site on one of
  your lists, and FocusDeck designates that category.

## What is never sent

- **Nothing about the page.** No URL or any part of one (path, query,
  fragment), no hostname, no page title or content, no tab or window ids, no
  timestamps.
- **Nothing about unlisted sites**, not even that you visited one. A switch to
  a site that isn't listed sends nothing. It doesn't reset de-duplication
  either, because X → unlisted → X sent as two X events would give the trip
  away.
- **Nothing about when you browse.** The config is fetched on a schedule: at
  startup, every minute, and when you save the options. It is never fetched
  because of a tab switch, since that request's timing would tell FocusDeck
  you switched, even to a site it may not see.

Hostnames are compared in memory and discarded. The extension stores no
browsing either. It keeps exactly three kinds of data:

- your settings, in `chrome.storage.local`;
- FocusDeck's site lists;
- the last category FocusDeck accepted.

The last two are in `chrome.storage.session`, which is memory only and cleared
when the browser quits.

## How it works

1. **Config.** It fetches `GET /api/sensor/config` when the browser starts,
   every minute (an alarm), and when you save the options. It keeps a site
   list only for `browser-x` and `browser-docs`, and only if FocusDeck lists
   that category in `designatedApps` (the bridge filters too). Each list is
   checked to be plain hostnames. If a refresh fails, the lists are emptied:
   a category the extension doesn't know is designated is never sent.
2. **Triggers.** It re-reads the active tab of the focused window when:
   - a tab is activated;
   - the active tab's URL changes;
   - a browser window gains focus.

   If no browser window has focus, nothing is sent.
3. **Matching.** A hostname matches a site if it equals it or is a subdomain
   of it. So `mobile.x.com` matches `x.com`, and `notx.com` and
   `x.com.evil.example` don't. Only `http(s)` tabs count, never `chrome://`,
   `file:` or the new tab page. When one hostname matches both lists, the more
   specific site wins: `developer.mozilla.org` beats `mozilla.org`. A hostname
   listed equally under both categories matches nothing.
4. **De-dup.** Consecutive switches within one category send one event, and
   unlisted sites don't reset that. A category counts as sent only once
   FocusDeck has accepted it (any 2xx). So if FocusDeck was down, the next
   switch to that category is sent again.
5. **Delivery.** It POSTs `/api/sensor/events` as JSON with a 2 s timeout. It
   never retries and keeps no queue of your activity. Failures are silent.
   Cookies are never sent, and redirects are refused, so the token goes only to
   the URL you set.

## Permissions

| Permission | Why |
| --- | --- |
| `tabs` | To read the active tab's URL, the only way to learn its hostname. Chrome describes it as "Read your browsing history". The extension reads one URL when the active tab changes, reduces it to a hostname, compares it with your lists, and discards it |
| `storage` | `chrome.storage.local` keeps the FocusDeck URL and token. `chrome.storage.session` keeps FocusDeck's site lists and the last category sent, so de-duplication survives the service worker sleeping |
| `alarms` | To refresh the config every minute on a fixed schedule. An MV3 service worker sleeps after about 30 s, so a timer can't do it. Refreshing at your next tab switch instead would leak that switch's timing |
| `http://127.0.0.1/*`, `http://localhost/*` | To reach FocusDeck on this machine, on any port, without CORS. These are the only hosts the extension can reach, so the token can't go anywhere else |

It asks for nothing else: no `<all_urls>` or other sites, no content scripts,
no `scripting`, `webNavigation`, `webRequest`, `history`, `cookies` or
`activeTab`. It never runs code in a page, so it never sees page content.

## Install

You need a Chromium-based browser (Chromium 103 or later), and FocusDeck
running on this machine.

1. **Load the extension.**
   1. Open the browser's extensions page: `chrome://extensions`, or
      `edge://extensions` in Edge.
   2. Turn on Developer mode, choose **Load unpacked**, and pick
      `sensors/browser/extension`.
2. **Point it at FocusDeck,** unless FocusDeck runs at the default
   `http://127.0.0.1:3000` without a token.
   1. Open the extension's options: Details, then Extension options.
   2. Enter FocusDeck's URL (`http`, on `127.0.0.1` or `localhost`, any port)
      and the token, if the server sets `FOCUSDECK_SENSOR_TOKEN`.
   3. Save. The page then says what the extension is watching, e.g.
      "Connected. Watching Browser — X (2 sites) and Browser — docs (6
      sites)", or why it can't.
3. **Designate the categories and list your sites in FocusDeck.** Designate
   Browser — X and Browser — docs, and list the sites for each. The
   extension picks up changes within a minute.

## What FocusDeck's bridge sees

These are the headers Chrome for Testing 153 sent, as recorded by the
end-to-end test's stand-in bridge:

| Request | `Origin` | `Sec-Fetch-Site` | Also |
| --- | --- | --- | --- |
| `GET /api/sensor/config` | none | `none` | `Authorization` if set |
| `POST /api/sensor/events` | `chrome-extension://<extension id>` | `none` | `Content-Type: application/json`, `Authorization` if set |

Neither request sends a cookie or a `Referer`. FocusDeck's bridge accepts the
`chrome-extension://` origin on the POST as a sensor's, never as the FocusDeck
page (`src/lib/bridge/trust.ts`). A web page can't send that origin.

## Verify

`npx vitest run sensors/browser` runs both test files.
`e2e.test.ts` loads the real extension in headless Chromium:

- It uses `chromium.launchPersistentContext` with `channel: "chromium"` and
  `--load-extension`.
- `--host-resolver-rules` maps the test sites to a stand-in bridge on loopback
  and every other hostname to nothing.
- It runs with no proxy, so it never reaches the internet.
- It drives the options page, browses listed, unlisted and lookalike sites,
  switches tabs and windows, changes designation, and has the bridge refuse
  one event. It then asserts every POST body, header and stored value.

The e2e test needs Playwright and its Chromium. They aren't FocusDeck
dependencies: a global install works if `NODE_PATH` points at it. Without
them, the suite is skipped, and its name says why.

Against a running FocusDeck, switch to one of your X sites, then:

```sh
curl -s -H "Authorization: Bearer $FOCUSDECK_SENSOR_TOKEN" 'http://127.0.0.1:3000/api/sensor/events?after=0'
# {"events":[{"kind":"app-switch","app":"browser-x","at":…,"via":"browser-extension",…}],…}
```

## Known limitations

- **Chromium only.** Firefox isn't supported yet. It runs MV3 background
  scripts rather than service workers, and would need its own manifest and
  testing.
- **Tested in one browser only.** The extension ran only in Chrome for Testing
  153, headless, on Linux. It was also run once against FocusDeck's real
  bridge (production build). Both categories arrived with `via`, and no
  hostname, path, title or query reached the bridge. It wasn't run in Chrome, Edge, Brave or Arc with a
  window, or on macOS or Windows. Headless can't take focus away from the
  browser, so "nothing is sent while no browser window has focus" is
  untested. Edge, Brave and Arc are Chromium, so they are expected to send the
  same `chrome-extension://` origin, but that wasn't checked.
- **It reports switches, not state.** The tab already in front when the
  extension is installed or reloaded is reported at the next switch.
- **Coming back isn't a switch.** Leaving the browser and returning to the
  same category sends nothing, because the extension can't see where you went.
  With the macOS sensor, X → editor → X reaches FocusDeck as X, editor.
- **Incognito** windows are reported only if you allow the extension in
  incognito (Details, then Allow in Incognito). It is off by default.
- **FocusDeck on this machine only.** Any other host would need another host
  permission.
- **No retry.** A switch sent while FocusDeck is down is lost; the next switch
  to that category is sent again.
- **Two categories.** Site lists for anything other than `browser-x` and
  `browser-docs` are ignored.
