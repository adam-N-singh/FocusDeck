# Codex CLI sensor

This connector tells FocusDeck when an OpenAI Codex CLI session is waiting for
your approval, finishes a turn, or resumes, without reading anything that was
said. One script serves both of Codex's extension points:

- **Lifecycle hooks** (Codex CLI 0.148+) give all three signals.
- **The legacy `notify` program** gives `agent-finished` only, on any Codex
  version that has it.

| File | Role |
| --- | --- |
| `mapping.mjs` | Pure mapping: hook input or notify payload → sensor event, or `null` |
| `focusdeck-hook.mjs` | The command: stdin (hook) or last argument (notify) → mapping → `POST /api/sensor/events` |
| `hooks.example.toml` | Registers the hook for `PermissionRequest`, `Stop` and `UserPromptSubmit` |
| `notify.example.toml` | The `notify` alternative |
| `mapping.test.ts` | Vitest: the mapping table, Class E, hashing, and runs of the real script |
| `manifest.json` | The marketplace entry |

## How it was verified

Codex's documentation lives at
[developers.openai.com/codex/config-advanced](https://developers.openai.com/codex/config-advanced)
and [/codex/config-reference](https://developers.openai.com/codex/config-reference)
(both linked from the repository's
[`docs/config.md`](https://github.com/openai/codex/blob/main/docs/config.md)).
That site was not reachable from the build environment. Everything below was
instead checked against Codex's own source on 2026-11-03, at the
[`rust-v0.166.0`](https://github.com/openai/codex/tree/rust-v0.166.0) release:

- **Hook inputs:** the generated JSON schemas in
  [`codex-rs/hooks/schema/generated/`](https://github.com/openai/codex/tree/rust-v0.166.0/codex-rs/hooks/schema/generated).
- **Config shape:** `HookEventsToml` and `HookHandlerConfig` in
  `codex-rs/protocol/src/hooks.rs`, and `codex-rs/core/config.schema.json`.
  `hooks.example.toml` validates against that schema.
- **How hooks run:** `codex-rs/hooks/src/engine/command_runner.rs` (shell, cwd,
  environment, stdin) and the per-event output parsers.
- **The notify payload:** `codex-rs/hooks/src/legacy_notify.rs`.
- **When `PermissionRequest` fires:** `codex-rs/core/src/tools/approvals.rs`.

Versions were pinned by reading the same files at each release tag:

- `PermissionRequest` arrived in **0.122**.
- Hooks became stable and on by default in **0.124**.
- `async` hooks run from **0.148**. From 0.124 to 0.147, Codex *skips* a hook
  marked `async = true`, with the warning "async hooks are not supported yet".

## What is sent

| Codex | FocusDeck `kind` |
| --- | --- |
| `PermissionRequest` hook | `agent-needs-input` |
| `Stop` hook | `agent-finished` |
| `UserPromptSubmit` hook, unless a subagent's | `agent-resumed` |
| `notify` with `"type": "agent-turn-complete"` | `agent-finished` |
| Anything else | Nothing is sent |

Every event has exactly four fields:

```json
{"kind":"agent-needs-input","app":"codex","source":"7890f15d76f15c0a","via":"codex"}
```

`source` is the first 16 hex characters of `sha256` of the session id: a
hook's `session_id`, or notify's `thread-id`. For the main session these are
the same id, so both mechanisms give a session the same `source`. It is
**omitted** when there is no id. `via` names this connector. The bridge stamps
the time when it receives the event.

## What is never sent

Nothing else from Codex's input is ever sent. That includes:

- from hooks: `prompt`, `last_assistant_message`, `tool_name` and `tool_input`
  (the command waiting for approval), `transcript_path`, `cwd`, `model`,
  `permission_mode`, `turn_id`, `agent_id` and `agent_type`;
- from `notify`: `input-messages`, `last-assistant-message`, `cwd`, `client`
  and `turn-id`;
- the raw session id.

`mapping.mjs` builds the event from constants plus one hash. It never copies or
filters the input, so a field Codex adds later cannot leak. The bridge would
reject an event carrying one anyway (Privacy Class E). `hook_event_name`,
notify's `type` and `agent_id` are read to make the decision, and are never
sent. Even with `FOCUSDECK_DEBUG=1`, stderr shows the event and never the input.

## Which events count

- **`PermissionRequest`** runs in Codex's approval path, just before the
  approval UI. A hook may answer allow or deny there. This one never can: Codex
  ignores an `async` hook's answer, and this script prints nothing anyway, so
  the normal approval prompt follows.
- **Subagents.** A subagent's `PermissionRequest` carries the main session's
  `session_id`, so it opens a loop on that session: you approve it in the same
  window. A subagent's `UserPromptSubmit` (it has an `agent_id`) is input from
  its parent agent, not from you, so it is dropped. `Stop` fires for the main
  thread only. Subagents have `SubagentStop`, which is not mapped.
- **`notify`** fires once per turn, as `agent-turn-complete`. It has no
  approval event, which is why the hooks are the recommended setup.

## Install

1. **Node ≥ 18** must be on the `PATH` that Codex starts hooks with. Codex runs
   a hook command through your login shell (`$SHELL -lc`; `cmd.exe /C` on
   Windows), in the session's working directory. If node comes from nvm and
   the like, it may not be on a login shell's `PATH`, so put node's absolute
   path (`which node`) in the command.
2. **Register the hooks.** Append `hooks.example.toml` to
   `~/.codex/config.toml` and replace `/ABSOLUTE/PATH/TO/FocusDeck` with your
   clone's path. Keep any hooks you already have for these events alongside
   these. The same hooks can instead go in `~/.codex/hooks.json`, in the same
   JSON shape as Claude Code's `hooks` block.
3. **Trust them.** Start `codex`. When it shows *Hooks need review*, choose
   *Trust all and continue*, or review each one with `/hooks`. Codex never runs
   an untrusted hook, in `codex exec` included. Editing a hook changes its hash,
   so it needs trusting again.
4. **Designate Codex CLI in FocusDeck.** With its sensor bridge on, the app
   sends the bridge its designated apps. Until it has, the bridge drops
   everything.

Settings notes, from the source:

- `async = true` makes Codex start the hook and carry on without waiting, so
  it can never delay a prompt or an approval. `timeout` is in seconds.
- On Codex 0.124 to 0.147, delete the `async = true` lines, because those
  versions skip async hooks. The hooks then run synchronously. That is usually
  around 0.1 s, and at most about 1.5 s if the bridge hangs.
- No `matcher` is set, so `PermissionRequest` fires for every tool.

### Alternative: `notify`

On Codex without hooks, or if you'd rather not trust hooks, use
`notify.example.toml`. `notify` is a top-level key, so it must sit above the
first `[table]` in `config.toml`. It reports `agent-finished` only. Codex
gives the program no stdin and discards its output.

Use `notify` *or* the `Stop` hook, never both, or every turn is reported twice.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `FOCUSDECK_URL` | `http://127.0.0.1:3000` | Where the bridge is. A trailing slash is fine |
| `FOCUSDECK_SENSOR_TOKEN` | unset | Sent as `Authorization: Bearer <token>`. Required when the server sets the same variable |
| `FOCUSDECK_DEBUG` | unset | `1` writes one line per run to stderr: the event and the bridge's answer, never Codex's input |
| `FOCUSDECK_INTERNAL` | unset | `1` sends nothing and exits at once. FocusDeck sets it when it runs Codex for its own features |

Hooks and `notify` both inherit Codex's environment. Codex withholds only a
handful of its own credential variables, and none of these.

## Guarantees

- **Never writes to stdout.** A `UserPromptSubmit` hook's plain stdout is
  added to the model's context, so `process.stdout.write` is replaced with a
  no-op at startup.
- **Silent on stderr** unless `FOCUSDECK_DEBUG=1`. Node's own warnings are
  suppressed too.
- **Always exits 0.** That covers bad JSON, unmapped events, a refused
  connection, a bridge that doesn't answer within 1.5 s (AbortController), a
  4 s backstop if stdin never closes, and uncaught errors.
- **No dependencies.** It uses Node ≥ 18 built-ins only: global `fetch`,
  `node:crypto` and `node:fs`. There is no install step.

## Verify

`npx vitest run sensors/codex` runs the tests. They include runs of the real
script in both modes against a stand-in bridge: a closed port, a bridge that
never answers, a token, and `FOCUSDECK_INTERNAL=1`.

To send one event to your running FocusDeck by hand:

```sh
FOCUSDECK_DEBUG=1 node sensors/codex/focusdeck-hook.mjs \
  '{"type":"agent-turn-complete","thread-id":"focusdeck-test","last-assistant-message":"never sent"}'
# focusdeck-codex: sent {"kind":"agent-finished","app":"codex","source":"7890f15d76f15c0a","via":"codex"} -> 200 {"accepted":1,…}
```

## Known limits

- **Not run inside a live Codex session.** It was tested against the input
  shapes in Codex's source. Installing Codex in the build environment wasn't
  permitted, and the documentation site wasn't reachable, so the manifest says
  `spike` until one of those checks is done.
- **Automatic approval review over-reports.** `PermissionRequest` fires before
  the reviewer, whether that is you or Codex's automatic reviewer. Approvals
  the automatic reviewer settles without you still open a loop.
- **Approving doesn't close the loop.** Approval fires no `UserPromptSubmit`,
  so the loop a permission request opened closes at your next prompt in that
  session.
- **A finished turn may not be final.** If another `Stop` hook makes Codex
  continue, FocusDeck has already seen `agent-finished`, and sees it again when
  the turn really ends.
- **`notify` sees no approvals.** With `notify` alone, a session waiting on
  you looks like a running one.
- **The hash is unsalted.** Anyone holding a session id, for example from a
  rollout file under `~/.codex/sessions`, can link it to its `source`. The
  hash hides the id; it doesn't make sessions unlinkable.
