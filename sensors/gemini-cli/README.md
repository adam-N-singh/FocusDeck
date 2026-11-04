# Gemini CLI sensor

This is a set of Gemini CLI [hooks](https://geminicli.com/docs/hooks/) that
tells FocusDeck when a session is waiting for your confirmation, finishes a
turn, or resumes, without reading anything that was said.

| File | Role |
| --- | --- |
| `mapping.mjs` | Pure mapping: hook input → sensor event, or `null` |
| `focusdeck-hook.mjs` | The hook command: stdin → mapping → `POST /api/sensor/events` |
| `settings.example.json` | Registers the hook for `Notification`, `AfterAgent` and `BeforeAgent` |
| `mapping.test.ts` | Vitest: the mapping table, Class E, hashing, and runs of the real hook |
| `manifest.json` | The marketplace entry |

## How it was verified

The hooks schema and every input field below were checked on 2026-11-03
against the official documentation. geminicli.com wasn't reachable from the
build environment, so it was read at its source in the
[google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli)
repository: [`docs/hooks/index.md`](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md)
and [`docs/hooks/reference.md`](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md).
The behaviour the docs leave open was checked in the source, at the
2026-11-02 `main` (v0.66.0 is the latest stable release):

- **How a hook runs:** `packages/core/src/hooks/hookRunner.ts` covers the
  shell, cwd, environment, timeout, and how stdout and stderr are read.
- **The environment:** `packages/core/src/services/environmentSanitization.ts`.
- **When `Notification` fires:** `packages/core/src/scheduler/confirmation.ts`.
- **When `BeforeAgent` and `AfterAgent` fire:** `packages/core/src/core/client.ts`.
- **Version:** release tags of `packages/cli/src/config/settingsSchema.ts`.
  Hooks are on by default from **v0.26.0** (`hooksConfig.enabled`). Earlier
  versions had them as an opt-in experiment.

## What is sent

| Gemini CLI hook | FocusDeck `kind` |
| --- | --- |
| `Notification` of type `ToolPermission` | `agent-needs-input` |
| `AfterAgent` | `agent-finished` |
| `BeforeAgent` | `agent-resumed` |
| Anything else | Nothing is sent |

Every event has exactly four fields:

```json
{"kind":"agent-needs-input","app":"gemini-cli","source":"7890f15d76f15c0a","via":"gemini-cli"}
```

`source` is the first 16 hex characters of `sha256(session_id)`:

- **Stable**, so when a session resumes, FocusDeck can close the loop that
  same session opened.
- **Opaque**, so the session id itself is never sent.
- **Omitted** when there is no `session_id`.

`via` names this connector. The bridge stamps the time when it receives the
event.

## What is never sent

Nothing else from the hook input is ever sent. That includes `prompt` and
`prompt_response`, the notification's `message` and `details` (the tool
waiting for confirmation, and its arguments), `transcript_path`, `cwd`,
`timestamp`, and the raw `session_id`.

`mapping.mjs` builds the event from constants plus one hash. It never copies or
filters the input, so a field Gemini CLI adds later cannot leak. The bridge
would reject an event carrying one anyway (Privacy Class E).
`notification_type` is read to make the decision, and is never sent. Even with
`FOCUSDECK_DEBUG=1`, stderr shows the event and never the input.

## Which events count

- **`Notification`** fires just before Gemini CLI shows a tool confirmation
  and waits for you. `ToolPermission` is the only type there is. Any other or
  missing type is dropped until someone decides what it means. In YOLO mode
  (or for tools you've allowed), nothing asks you, so nothing is sent.
- **`AfterAgent`** fires once per turn, when the agent's final answer is in.
  **`BeforeAgent`** fires once per prompt you submit, before planning. Only
  the main agent fires them: subagents run their own chat loop, without these
  hooks.
- **No matchers.** Gemini CLI applies a hook's `matcher` only to tool and
  lifecycle-source events. For these three events, it would be ignored, so
  the filtering is all in `mapping.mjs`.

## Install

1. **Node ≥ 18** must be on the `PATH` Gemini CLI starts with, because hooks
   inherit its environment. They run through `bash -c` (PowerShell on
   Windows) in the session's working directory. If node comes from nvm and the
   like, put node's absolute path (`which node`) in the command.
2. **Register the hooks.** Merge the `hooks` block of `settings.example.json`
   into `~/.gemini/settings.json`. User level means every session reports, in
   every folder you trust. Replace `/ABSOLUTE/PATH/TO/FocusDeck` with your
   clone's path. Keep any hooks you already have for these events alongside
   these.
3. **Restart Gemini CLI.** `/hooks panel` should list three hooks named
   `focusdeck`. `/hooks disable focusdeck` turns all three off.
4. **Designate Gemini CLI in FocusDeck.** With its sensor bridge on, the app
   sends the bridge its designated apps. Until it has, the bridge drops
   everything.

Settings notes, from the docs and the source:

- **Gemini CLI waits for every hook.** It has no async option. The hook costs
  a Node start plus one loopback POST, around 0.1 s. A refused connection
  fails at once. A bridge that accepts but never answers costs 1.5 s, then the
  hook gives up. `"timeout": 5000` (milliseconds) is Gemini CLI's own backstop.
- `Notification` is awaited just before the confirmation appears, so a
  wedged bridge delays the prompt by those 1.5 s.
- **Folder trust gates every hook.** With folder trust on (the default), Gemini
  CLI runs no settings hooks at all in a folder you haven't trusted, user-level
  ones included, until you accept its trust prompt (`packages/core/src/hooks/hookRegistry.ts`).

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `FOCUSDECK_URL` | `http://127.0.0.1:3000` | Where the bridge is. A trailing slash is fine |
| `FOCUSDECK_SENSOR_TOKEN` | unset | Sent as `Authorization: Bearer <token>`. Required when the server sets the same variable |
| `FOCUSDECK_DEBUG` | unset | `1` writes one line per run to stderr: the event and the bridge's answer, never hook input |
| `FOCUSDECK_INTERNAL` | unset | `1` sends nothing and exits at once. FocusDeck sets it when it runs Gemini CLI for its own features |

Gemini CLI passes its environment to hooks unchanged, unless one of two things
holds:

- **You turned on `security.environmentVariableRedaction`.** Gemini CLI then
  strips `FOCUSDECK_SENSOR_TOKEN`, because its name contains `TOKEN`. Add it to
  `security.environmentVariableRedaction.allowed` to keep it.
- **`GITHUB_SHA` is set, as in GitHub Actions.** Gemini CLI then strips every
  variable it doesn't allow by default, so `FOCUSDECK_*` reach no hook. Run
  there, the hook reports to the default URL, where no bridge should be
  listening.

## Guarantees

- **Never writes to stdout.** Gemini CLI parses a hook's stdout as its answer,
  and a `BeforeAgent` answer can add context to your prompt. So
  `process.stdout.write` is replaced with a no-op at startup.
- **Silent on stderr** unless `FOCUSDECK_DEBUG=1`. Node's own warnings are
  suppressed too. When stdout is empty, Gemini CLI reads stderr instead and
  shows plain text as a system message, so debug lines appear in its terminal.
  Without debug there is nothing to show.
- **Always exits 0.** That covers bad JSON, unmapped events, a refused
  connection, a bridge that doesn't answer within 1.5 s (AbortController), a
  4 s backstop if stdin never closes, and uncaught errors. Exit 2 would block
  the turn, so it never happens.
- **No dependencies.** It uses Node ≥ 18 built-ins only: global `fetch`,
  `node:crypto` and `node:fs`. There is no install step.

## Verify

`npx vitest run sensors/gemini-cli` runs the tests. They include runs of the
real hook against a stand-in bridge: a closed port, a bridge that never
answers, a token, and `FOCUSDECK_INTERNAL=1`.

To send one event to your running FocusDeck by hand:

```sh
echo '{"hook_event_name":"AfterAgent","session_id":"focusdeck-test","prompt":"never sent"}' \
  | FOCUSDECK_DEBUG=1 node sensors/gemini-cli/focusdeck-hook.mjs
# focusdeck-gemini-cli: sent {"kind":"agent-finished","app":"gemini-cli","source":"7890f15d76f15c0a","via":"gemini-cli"} -> 200 {"accepted":1,…}
```

## Known limits

- **Tested against the documented input shapes**, by piping them into the
  hook. It has not been run inside a live Gemini CLI session: installing it in
  the build environment wasn't permitted.
- **Untrusted folders report nothing.** Gemini CLI skips every hook there.
- **Confirming a tool doesn't close the loop.** Confirmation fires no
  `BeforeAgent`, so the loop that confirmation opened closes at your next
  prompt in that session.
- **A finished turn may not be final.** If another `AfterAgent` hook rejects
  the answer and forces a retry, FocusDeck has already seen `agent-finished`,
  and sees it again when the retry ends.
- **A cancelled turn has no ending.** When cancelling (Esc) aborts the turn,
  Gemini CLI takes its cancel path, which skips `AfterAgent`, so FocusDeck
  doesn't see that turn end.
- **The hash is unsalted.** Anyone holding a session id, for example from a
  file under `~/.gemini/tmp`, can link it to its `source`. The hash hides the
  id; it doesn't make sessions unlinkable.
