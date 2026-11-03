# Cursor sensor

This is a Cursor agent [hook](https://cursor.com/docs/hooks) that tells
FocusDeck when a Cursor agent run finishes, and when you send it a new prompt,
without reading anything that was said. Its events use the catalog's existing
`cursor-agent` app.

> **Spike.** The mechanism was checked against Cursor's official examples, not
> its documentation page, and it has never run inside Cursor. Cursor has no
> hook for an agent waiting on your approval, so this connector can't report
> one.

| File | Role |
| --- | --- |
| `mapping.mjs` | Pure mapping: hook input → sensor event, or `null` |
| `focusdeck-hook.mjs` | The hook command: stdin → mapping → `POST /api/sensor/events` |
| `hooks.example.json` | Registers the hook for `stop` and `beforeSubmitPrompt` |
| `mapping.test.ts` | Vitest: the mapping table, Class E, hashing, and runs of the real hook |
| `manifest.json` | The marketplace entry |

## How it was verified

Cursor is closed source, and cursor.com wasn't reachable from the build
environment, so its [hooks page](https://cursor.com/docs/hooks) couldn't be
read in full. On 2026-11-03 its contents were checked against these sources
instead:

- **Cursor's official repositories:**
  - [`cursor/cookbook`, `hooks/`](https://github.com/cursor/cookbook/tree/main/hooks):
    - the `hooks.json` format: `"version": 1`, and per hook `command`,
      `matcher`, `timeout` in seconds, and `failClosed`;
    - `beforeSubmitPrompt` registered with `"matcher": "UserPromptSubmit"`;
    - user hooks in `~/.cursor/hooks.json`;
    - `failClosed: true` failing closed on crashes, timeouts and invalid
      output.
  - [`cursor/plugins`](https://github.com/cursor/plugins): the `stop` hook's
    input and output, in `ralph-loop/hooks/stop-hook.sh` and
    `continual-learning/hooks/continual-learning-stop.ts`. The input has
    `conversation_id`, `generation_id`, `status` (`completed`, `aborted` or
    `error`), `loop_count` and `transcript_path`. The output is a
    `followup_message`, or "exit 0 with no output to stop".
- **Search excerpts of the hooks page:** `beforeSubmitPrompt` receives
  `prompt` and `attachments`, and answers `continue` with an optional
  `user_message`.
- **Cursor's [1.7 changelog](https://cursor.com/changelog/1-7):** hooks
  (beta) arrived in 1.7.

## What is sent

| Cursor hook | FocusDeck `kind` |
| --- | --- |
| `stop` with status `completed` or `error`, or no status | `agent-finished` |
| `beforeSubmitPrompt` | `agent-resumed` |
| `stop` with status `aborted` | Nothing is sent |
| Anything else | Nothing is sent |

Every event has exactly four fields:

```json
{"kind":"agent-finished","app":"cursor-agent","source":"7890f15d76f15c0a","via":"cursor"}
```

`source` is the first 16 hex characters of `sha256(conversation_id)`:

- **Stable** for the whole conversation. `generation_id` changes every turn and
  isn't used.
- **Opaque**, so the conversation id itself is never sent.
- **Omitted** when there is no `conversation_id`.

`via` names this connector. The bridge stamps the time when it receives the
event.

## What is never sent

Nothing else from the hook input is ever sent. That includes `prompt` and
`attachments`, `workspace_roots`, `user_email`, `model`, `cursor_version`,
`transcript_path`, `generation_id`, `loop_count`, and the raw
`conversation_id`.

`mapping.mjs` builds the event from constants plus one hash. It never copies or
filters the input, so a field Cursor adds later cannot leak. The bridge would
reject an event carrying one anyway (Privacy Class E). `status` and
`hook_event_name` are read to make the decision, and are never sent. Even with
`FOCUSDECK_DEBUG=1`, stderr shows the event and never the input.

## Why there is no `agent-needs-input`

Cursor has no hook that fires when the agent stops to wait for your approval:

- `beforeShellExecution`, `beforeMCPExecution` and `preToolUse` fire before
  *every* call, including the ones Cursor runs without asking. So they can't
  tell "blocked on you" from "working".
- A hook could answer `ask` to force an approval prompt, but that changes how
  the agent behaves, which a sensor must never do.
- Community reports in Cursor's forum say Cursor rejects `Notification` and
  `PermissionRequest` as unknown hook types.

So a Cursor agent waiting on you looks like a running one.

## Which stops count

- **`completed`** and **`error`** count: the agent stopped on its own, and
  needs you next.
- **`aborted`** means you stopped it, so you are already there. Nothing is
  sent.
- **No status at all** still means the agent loop ended, so it counts.

## Install

1. **Node ≥ 18** must be on the `PATH` Cursor starts hooks with. Cursor is a
   desktop app, so its `PATH` may not be your terminal's. If `node` isn't
   found, put its absolute path (`which node`) in the commands.
2. **Register the hooks.** Copy `hooks.example.json` to `~/.cursor/hooks.json`,
   or merge its two entries into the `hooks` object of the file you have.
   Replace `/ABSOLUTE/PATH/TO/FocusDeck` with your clone's path. User level
   means every project reports.
3. **Restart Cursor**, so it loads the hooks.
4. **Designate the Cursor agent in FocusDeck.** With its sensor bridge on, the
   app sends the bridge its designated apps. Until it has, the bridge drops
   everything.

Notes on `hooks.example.json`:

- **Each command passes the hook's name** as an argument. That is a fallback
  for input that doesn't name its event. When the input has
  `hook_event_name`, it wins.
- **`"failClosed": false`** says it explicitly: if the hook crashes, times
  out, or answers nothing usable, Cursor carries on.
- **`"matcher": "UserPromptSubmit"`** is copied from Cursor's cookbook, which
  uses it for hooks that must see every prompt you submit.
- **`"timeout": 5`** is in seconds. Cursor waits for these hooks. The hook
  costs a Node start plus one loopback POST, around 0.1 s, and gives up on the
  bridge after 1.5 s.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `FOCUSDECK_URL` | `http://127.0.0.1:3000` | Where the bridge is. A trailing slash is fine |
| `FOCUSDECK_SENSOR_TOKEN` | unset | Sent as `Authorization: Bearer <token>`. Required when the server sets the same variable |
| `FOCUSDECK_DEBUG` | unset | `1` writes one line per run to stderr: the event and the bridge's answer, never hook input |
| `FOCUSDECK_INTERNAL` | unset | `1` sends nothing and exits at once. FocusDeck sets it when it runs Cursor's agent for its own features |

Hooks inherit Cursor's environment. For a desktop app, that means variables
from your shell profile may be missing.

## Guarantees

- **Never writes to stdout.** Cursor reads a hook's stdout as its answer. A
  `stop` answer can submit a follow-up message to the agent, and a
  `beforeSubmitPrompt` answer can block your prompt. So `process.stdout.write`
  is replaced with a no-op at startup.
- **Silent on stderr** unless `FOCUSDECK_DEBUG=1`. Node's own warnings are
  suppressed too.
- **Always exits 0.** That covers bad JSON, unmapped events, a refused
  connection, a bridge that doesn't answer within 1.5 s (AbortController), a
  4 s backstop if stdin never closes, and uncaught errors.
- **No dependencies.** It uses Node ≥ 18 built-ins only: global `fetch`,
  `node:crypto` and `node:fs`. There is no install step.

## Verify

`npx vitest run sensors/cursor` runs the tests. They include runs of the real
hook against a stand-in bridge: a closed port, a bridge that never answers, a
token, and `FOCUSDECK_INTERNAL=1`.

To send one event to your running FocusDeck by hand:

```sh
echo '{"hook_event_name":"stop","conversation_id":"focusdeck-test","status":"completed","prompt":"never sent"}' \
  | FOCUSDECK_DEBUG=1 node sensors/cursor/focusdeck-hook.mjs stop
# focusdeck-cursor: sent {"kind":"agent-finished","app":"cursor-agent","source":"7890f15d76f15c0a","via":"cursor"} -> 200 {"accepted":1,…}
```

## Known limits

- **Never run inside Cursor.** It was tested against the input shapes in
  Cursor's examples, by piping them into the hook.
- **It answers nothing.** Cursor's own examples always print an answer, such
  as `{"continue":true}` for `beforeSubmitPrompt`. This hook prints nothing.
  For `stop`, that is documented as fine. For `beforeSubmitPrompt`, it relies
  on `"failClosed": false` letting the prompt through. If a Cursor version ever
  held a prompt back, delete the `beforeSubmitPrompt` entry.
- **The Cursor CLI may stay silent.** Community reports say `cursor-agent`
  doesn't fire `stop` or `beforeSubmitPrompt` in every mode (non-interactive
  runs in particular). Unverified.
- **Workspace trust is unverified.** Cursor's cookbook says trusted workspaces
  load *project* hooks. Whether Cursor also holds back these user-level hooks
  in an untrusted workspace isn't documented there.
- **Cloud agents don't report.** Per a search excerpt of Cursor's
  [cloud agent docs](https://cursor.com/docs/cloud-agent), user-level hooks
  don't run in cloud agents.
- **A finished run may not be final.** If another `stop` hook answers with a
  follow-up message, the agent carries on, but FocusDeck has already seen
  `agent-finished`.
- **The hash is unsalted.** Anyone holding a conversation id, for example from
  a transcript path, can link it to its `source`. The hash hides the id; it
  doesn't make conversations unlinkable.
