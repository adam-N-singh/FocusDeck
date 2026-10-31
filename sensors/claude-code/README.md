# Claude Code sensor

This is a Claude Code [hook](https://code.claude.com/docs/en/hooks) that tells
FocusDeck when an agent session is blocked on you, finishes, or resumes,
without reading anything that was said. It is ASSESSMENT.md §6, Stage 0 spike
(b).

| File | Role |
| --- | --- |
| `mapping.mjs` | Pure mapping: hook input → sensor event, or `null` |
| `focusdeck-hook.mjs` | The hook command: stdin → mapping → `POST /api/sensor/events` |
| `settings.example.json` | Registers the hook for `Notification`, `Stop` and `UserPromptSubmit` |
| `mapping.test.ts` | Vitest: the mapping table, Class E, hashing, and runs of the real hook |

The hook schema and every input field below were checked against the official
hooks reference on 2026-10-31.

## What is sent

| Claude Code hook | FocusDeck `kind` |
| --- | --- |
| `Notification` of type `permission_prompt`, `elicitation_dialog` or `elicitation_url_dialog` | `agent-needs-input` |
| `Stop` | `agent-finished` |
| `UserPromptSubmit` | `agent-resumed` |
| Anything else | Nothing is sent |

Every event has exactly three fields:

```json
{"kind":"agent-needs-input","app":"claude-code","source":"eaabdaa5d330d5d2"}
```

`source` is the first 16 hex characters of `sha256(session_id)`:

- **Stable**, so when a session resumes, FocusDeck can close the loop that
  same session opened.
- **Opaque**, so the session id itself is never sent.
- **Omitted** when there is no `session_id`.

The bridge stamps the time when it receives the event.

## What is never sent

Nothing else from the hook input is ever sent. That includes `prompt`,
`message`, `title` and `last_assistant_message`, `background_tasks` (and their
commands), `session_crons` (and their prompts), `transcript_path`, `cwd`,
`permission_mode` and `session_title`, tool names and inputs, and the raw
`session_id`.

`mapping.mjs` builds the event from constants plus one hash. It never copies or
filters the input, so a field Claude Code adds later cannot leak. The bridge
would reject an event carrying one anyway (Privacy Class E). `notification_type`
is read to make the decision, and is never sent. Even with `FOCUSDECK_DEBUG=1`,
stderr shows the event and never the input.

## Which notifications count

The `Notification` hook fires for many reasons. Only the ones that mean *this
session is blocked on you* become `agent-needs-input`:

- **Sent:**
  - `permission_prompt`: a tool use is waiting for your approval.
  - `elicitation_dialog`, `elicitation_url_dialog`: an MCP server is waiting
    for you.
- **Dropped:**
  - `idle_prompt` fires 60 s after Claude finished if you haven't typed, so it
    repeats the `Stop`. Mapping it would turn every finished task into an
    ageing open loop, which is counted as a miss after an hour, until you next
    typed in that session.
  - `auth_success`, `elicitation_complete`, `elicitation_response`,
    `quota_auto_resume_*` and `plugin_notification` report status, not a
    blocked agent.
  - `agent_needs_input` and `agent_completed` are raised by agent view about
    *background* sessions. The docs don't say whose `session_id` they carry,
    or whether the background session also reports through its own hooks.
    Excluding them avoids double counting, at the risk of missing background
    sessions. This is unverified.
- **No `notification_type` at all** (older Claude Code) is sent as
  `agent-needs-input`.

The list is `NEEDS_INPUT_NOTIFICATIONS` in `mapping.mjs`. The `matcher` in
`settings.example.json` mirrors it, so Claude Code doesn't even start the hook
for the other types. If you change one, change both.

## Install

1. **Node ≥ 18** must be on the `PATH` Claude Code starts with, because hooks
   inherit Claude Code's environment. With nvm and the like, put node's
   absolute path (`which node`) in the command.
2. **Register the hook.** Merge the `hooks` block of `settings.example.json`
   into `~/.claude/settings.json`. User level means every session reports.
   Replace `/ABSOLUTE/PATH/TO/FocusDeck` with your clone's path, wrapped in
   double quotes if it contains spaces. Keep any hooks you already have for
   these events alongside these.
3. **Designate Claude Code in FocusDeck.** With its sensor bridge on, the app
   sends the bridge its designated apps. Until it has, the bridge drops
   everything.

Settings notes, from the hooks reference:

- `"async": true` makes Claude Code start the hook and carry on without
  waiting, so the hook can never delay a prompt. `"timeout": 5` only matters if
  you remove `async`.
- `Stop` and `UserPromptSubmit` take no matcher. They fire every time.
- Interactive Claude Code holds back all hooks, including those in
  `~/.claude/settings.json`, until you accept the folder's workspace trust
  dialog.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `FOCUSDECK_URL` | `http://127.0.0.1:3000` | Where the bridge is. A trailing slash is fine |
| `FOCUSDECK_SENSOR_TOKEN` | unset | Sent as `Authorization: Bearer <token>`. Required when the server sets the same variable |
| `FOCUSDECK_DEBUG` | unset | `1` writes one line per run to stderr: the event and the bridge's answer, never hook input |

## Guarantees

- **Never writes to stdout.** A `UserPromptSubmit` hook's stdout is injected
  into Claude's context, so `process.stdout.write` is replaced with a no-op at
  startup.
- **Silent on stderr** unless `FOCUSDECK_DEBUG=1`. Node's own warnings are
  suppressed too.
- **Always exits 0.** That covers bad JSON, unmapped events, a refused
  connection, a bridge that doesn't answer within 1.5 s (AbortController), a
  4 s backstop if stdin never closes, and uncaught errors.
- **No dependencies.** It uses Node ≥ 18 built-ins only: global `fetch`,
  `node:crypto` and `node:fs`. There is no install step.

## Verify

`npx vitest run sensors/` runs the tests. They include runs of the real hook
against a stand-in bridge: a closed port, a bridge that never answers, and a
token.

To check against a real bridge, this example uses a production build on port
3200. Against your running FocusDeck, use port 3000 and skip the `PUT`: with
its sensor bridge on, the app does it.

```sh
npm run build && npx next start -H 127.0.0.1 -p 3200 &

# Designate apps as the app would. Without a token, only a same-origin request
# may do this (with FOCUSDECK_SENSOR_TOKEN set, send the token instead).
curl -s -X PUT http://127.0.0.1:3200/api/sensor/config \
  -H 'content-type: application/json' -H 'sec-fetch-site: same-origin' \
  -d '{"designatedApps":["claude-code","editor","terminal"]}'

# Feed the hook an input full of content.
echo '{"session_id":"7f3c2a10-5b9e-4c1d-9a7e-2f6b8d4e1c90","transcript_path":"/Users/me/.claude/projects/p/7f3c2a10.jsonl","cwd":"/Users/me/acme-payroll","hook_event_name":"UserPromptSubmit","prompt":"The prod DB password is Tr0ub4dor&3"}' \
  | FOCUSDECK_URL=http://127.0.0.1:3200 FOCUSDECK_DEBUG=1 node sensors/claude-code/focusdeck-hook.mjs

# See what FocusDeck received: metadata only.
curl -s 'http://127.0.0.1:3200/api/sensor/events?after=0'
# {"events":[{"kind":"agent-resumed","app":"claude-code","source":"eaabdaa5d330d5d2","at":…,"seq":1,…}],…}
```

## Known limits (Stage 0)

- **Tested against the documented input shapes**, by piping them into the hook.
  It has not been run inside a live Claude Code session.
- **Approving a permission prompt doesn't close the loop.** Approval fires no
  `UserPromptSubmit`, so the loop that permission prompt opened closes at your
  next prompt in that session.
- **`UserPromptSubmit` isn't only typed prompts.** It also fires for scheduled
  tasks, `/loop` iterations, background-subagent reports and cross-session
  messages. FocusDeck sees all of these as the agent resuming.
- **`Stop` misses two endings.** It doesn't fire when you interrupt (Esc), and
  API errors fire `StopFailure` instead, which is not mapped.
- **The hash is unsalted.** Anyone holding a session id, for example from a
  transcript file, can link it to its `source`. The hash hides the id; it
  doesn't make sessions unlinkable.
