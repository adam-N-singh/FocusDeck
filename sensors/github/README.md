# GitHub sensor

This is a small poller that turns your GitHub notifications into FocusDeck
signals, through your own `gh` login, without reading any of them. PRODUCT.md:
"PR feeds and agent fleets are the signal layer".

| File | Role |
| --- | --- |
| `mapping.mjs` | Pure: notification thread → sensor event, which notifications are new, and reading `gh api --include` |
| `focusdeck-github.mjs` | The poller: `gh` → mapping → `POST /api/sensor/events`, every 60 s |
| `focusdeck-github.service` | Example systemd user service (untested) |
| `com.focusdeck.github.plist` | Example launchd agent (untested) |
| `mapping.test.ts` | Vitest: the mapping table, Class E, hashing, parsing, and runs of the real poller against a stub `gh` |
| `manifest.json` | The marketplace entry |

## How it was verified

Checked on 2026-11-03 against GitHub's official documentation. docs.github.com
wasn't reachable from the build environment, so it was read at its source in
[github/docs](https://github.com/github/docs):

- **[REST API endpoints for notifications](https://docs.github.com/en/rest/activity/notifications)**
  (`content/rest/activity/notifications.md`) gives:
  - the notification `reason`s;
  - polling with `Last-Modified` and `If-Modified-Since`, where a `304` leaves
    your rate limit untouched;
  - `X-Poll-Interval`, with "Please obey the header";
  - the scopes needed: `notifications` or `repo`.
- **The `GET /notifications` operation**
  (`src/rest/data/fpt-2022-11-28/activity.json`, generated from GitHub's REST
  API description) gives the thread fields, that `id` is a string, the
  statuses 200, 304, 401, 403 and 422, and `per_page` defaulting to 50.
- **GitHub CLI source**, [cli/cli](https://github.com/cli/cli):
  - `pkg/cmd/api/api.go`: with `--include`, gh prints the status line, the
    headers, a blank line and the body. For any status above 299, `304`
    included, it exits 1 with the response already printed.
  - `internal/authflow/flow.go`: `gh auth login` asks for the `repo` scope.

## What is sent

| GitHub notification | FocusDeck `kind` |
| --- | --- |
| `reason` `review_requested`: a pull request is waiting for your review | `agent-needs-input` |
| `reason` `approval_requested`: a deployment is waiting for your approval | `agent-needs-input` |
| `reason` `ci_activity` (a workflow run you triggered completed), or a `CheckSuite` subject | `agent-finished` |
| `reason` `agent_session_finished`: a Copilot cloud agent session finished | `agent-finished` |
| Any other `reason`, including ones GitHub adds later | `notification` |
| A thread you've already read, or one without an id | Nothing is sent |

The reason decides first. A `CheckSuite` subject counts as CI whatever its
reason. Every event has exactly four fields:

```json
{"kind":"agent-needs-input","app":"github","source":"7890f15d76f15c0a","via":"github"}
```

`source` is the first 16 hex characters of `sha256` of the notification
thread's id. GitHub keeps one thread per pull request, issue or run, so every
notification about the same pull request shares a `source`. The thread id
itself is never sent. `via` names this connector. The bridge stamps the time
when it receives the event, so events arrive up to a poll interval after
GitHub raised them.

### Beyond the brief

`approval_requested` and `agent_session_finished` were mapped by analogy:

- `approval_requested` is a review request for a deployment.
- `agent_session_finished` is an agent run finishing, like `ci_activity`.

They are two lines in `KIND_BY_REASON` in `mapping.mjs`. Delete them to make
those plain notifications.

## What is never sent

Nothing else from the thread is ever sent:

- the subject's `title`;
- the `repository`: its name, owner, description and privacy;
- every URL: subject, latest comment, thread and subscription;
- `updated_at` and `last_read_at`;
- the raw thread id.

`mapping.mjs` builds the event from constants plus one hash. It never copies or
filters the thread, so a field GitHub adds later cannot leak. The bridge would
reject an event carrying one anyway (Privacy Class E). `reason`, `subject.type`
and `unread` are read to make the decision, and are never sent. None of the
thread reaches stderr or the state file either. With `FOCUSDECK_DEBUG=1`,
stderr shows counts and events. It never shows gh's own error messages, only
their exit codes.

## Each notification once

- **What counts as new.** A notification is its thread plus `updated_at`:
  GitHub bumps `updated_at` when there is news on a thread. A hash of the
  pair is remembered once reported. So news on a known thread is reported
  again, under the same `source`, and a notification that is still listed is
  never reported twice.
- **The first run only remembers.** With no state yet, the first poll marks
  everything already there as seen and sends nothing, so your backlog isn't
  replayed as news.
- **The state file** is `focusdeck-github-<uid>.json` in the OS temp dir
  (`os.tmpdir()`, which honours `TMPDIR`). It has mode 0600 and holds those
  hashes and the last `Last-Modified`, nothing else: the latest 1000 hashes,
  with still-listed ones always kept.
- **It is written safely.** Each save writes a fresh file and renames it into
  place. A symlink or another user's file at that path is neither trusted nor
  followed. When the OS cleans its temp dir, the next run is a first run
  again.
- **Nothing is retried.** A notification counts as seen even if the bridge was
  down, so the sensor keeps no queue of your activity.

## Polling

- **Every 60 s.** `FOCUSDECK_GITHUB_INTERVAL` (seconds) can slow it down, but
  it never polls faster than 60 s or than GitHub's `X-Poll-Interval`.
- **Idle polls are free.** After the first answer, each poll sends
  `If-Modified-Since`, so a poll with nothing new is a `304`.
- **One page.** Each poll reads the first page: the 50 most recent unread
  notifications.
- **Unread only**, as GitHub lists them by default. A notification you read on
  github.com before the next poll is never reported.
- **How gh runs.** It runs through `execFile` with an argument array, never a
  shell (`gh api --include notifications [--header "If-Modified-Since: …"]`).
  Prompts are off (`GH_PROMPT_DISABLED`), and so are update notices and
  colour. `FOCUSDECK_SENSOR_TOKEN` is removed from gh's environment. gh gets a
  20 s timeout.

## Install

1. **Node ≥ 18 and the GitHub CLI, logged in:** run `gh auth login`, then
   check with `gh auth status`.
   - The notifications endpoints need the `notifications` or `repo` scope, and
     gh's login asks for `repo`.
   - GitHub documents these endpoints as supporting classic personal access
     tokens, so a fine-grained token in `GH_TOKEN` won't work.
   - For GitHub Enterprise, set `GH_HOST`.
2. **Start the poller:** `node sensors/github/focusdeck-github.mjs`. It polls
   until you stop it with Ctrl-C.
3. **Keep it running** if you like. These examples are untested, and each file
   says how to install it:
   - `focusdeck-github.service`: a systemd user service, for Linux.
   - `com.focusdeck.github.plist`: a launchd agent, for macOS.
   - On Windows, a Task Scheduler task "at log on" running the same command
     should do. No example is included.

   Either way, `gh` must be on the service's `PATH`, and its login must be
   readable from there. Alternatively, run `--once` from cron or a scheduler.
4. **Designate GitHub in FocusDeck.** With its sensor bridge on, the app sends
   the bridge its designated apps. Until it has, the bridge drops everything.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `FOCUSDECK_URL` | `http://127.0.0.1:3000` | Where the bridge is. A trailing slash is fine |
| `FOCUSDECK_SENSOR_TOKEN` | unset | Sent as `Authorization: Bearer <token>`. Required when the server sets the same variable. Never passed to gh |
| `FOCUSDECK_DEBUG` | unset | `1` writes a line per poll to stderr: counts and events, never a title, repository or URL |
| `FOCUSDECK_INTERNAL` | unset | `1` sends nothing and exits at once, without running gh |
| `FOCUSDECK_GITHUB_INTERVAL` | `60` | Seconds between polls. Values under 60, or under GitHub's `X-Poll-Interval`, are raised to it |

gh's own variables (`GH_HOST`, `GH_TOKEN`, …) pass through to gh.

## Guarantees

- **Never writes to stdout.** `process.stdout.write` is replaced with a no-op
  at startup.
- **Silent on stderr** unless `FOCUSDECK_DEBUG=1`. Node's own warnings are
  suppressed too.
- **Always exits 0.** That covers gh missing, logged out, failing or timing
  out; GitHub answering 304, 401 or garbage; a refused connection; a bridge
  that doesn't answer within 1.5 s; Ctrl-C and SIGTERM; and uncaught errors.
- **No dependencies.** It uses Node ≥ 18 built-ins only. There is no install
  step.

## Verify

`npx vitest run sensors/github` runs the tests. They run the real poller
against a stub `gh` on `PATH` that prints canned `--include` output and
records its arguments. The cases cover the first run, new and updated
notifications, 304, 401, gh missing, a closed bridge port, a planted symlink,
batches over 100, `FOCUSDECK_INTERNAL=1`, and SIGTERM.

To check the path to your running FocusDeck without calling gh:

```sh
FOCUSDECK_DEBUG=1 node sensors/github/focusdeck-github.mjs --test
# focusdeck-github: sent {"kind":"notification","app":"github","source":"7890f15d76f15c0a","via":"github"} -> 200 {"accepted":1,…}
```

Then, for real: `FOCUSDECK_DEBUG=1 node sensors/github/focusdeck-github.mjs --once`
twice. The first run says how many notifications it remembered. The second
sends whatever arrived in between.

## Known limits

- **Not run against the live API.** The build environment's proxy refused
  `/notifications`. The poller was tested against gh's documented output
  format, through a stub `gh`.
- **gh's OAuth login is assumed to work.** GitHub's docs say these endpoints
  support classic personal access tokens. gh's login is an OAuth token with
  the classic `repo` scope, which should be accepted the same way, but that
  couldn't be tried here.
- **A review request's loop doesn't close by itself.** The poller reports
  news, not reads, so it can't tell when you've reviewed. Close the loop in
  FocusDeck, or at a review moment.
- **`CheckSuite` isn't documented.** It is the subject type GitHub uses for CI
  notifications in practice, but the docs leave `subject.type` an open string.
  `ci_activity` is the documented signal.
- **Watched repositories are noisy.** Every unread thread counts, including
  ones from repositories you merely watch (`subscribed`). GitHub's own
  notification settings are where to tune that.
- **The hash is unsalted.** Anyone who can list your notifications can link a
  thread id to its `source`. The hash hides the id; it doesn't make threads
  unlinkable.
