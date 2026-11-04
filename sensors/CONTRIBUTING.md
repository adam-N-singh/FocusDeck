# Building a connector

A connector is a small, open sensor that runs next to an app, such as a hook,
an extension or a tiny program. It tells FocusDeck when something happens
there, using a handful of metadata fields. Each connector is a folder with a
`manifest.json`, which is what puts it in the marketplace on the **Connect**
screen.

`sensors/claude-code/` is the reference. Copy its structure, its safety
properties and its tests.

## Where connectors live

- **Shipped with FocusDeck:** `sensors/<folder>/manifest.json`. Connectors in
  this folder published by `FocusDeck` show as verified.
- **Your own, or a community connector:** any folder laid out the same way.
  Point `FOCUSDECK_CONNECTORS_DIR` at it. Several folders work too, separated
  by `:` (or `;` on Windows). These connectors show as community.

FocusDeck re-reads manifests every few seconds and lists any that fail
validation, with the reason, at the bottom of the Connect screen. It never
downloads a connector and never runs anything from a manifest. Setup commands
are shown for a person to read and copy.

## The event contract

Every event is a JSON object with these fields and no others. The bridge
rejects anything more (`src/lib/bridge/intake.ts`).

| Field | Required | Meaning |
| --- | --- | --- |
| `kind` | yes | `app-switch`, `notification`, `agent-needs-input`, `agent-finished` or `agent-resumed` |
| `app` | yes | An app id: lowercase letters, digits and dashes (up to 40). Either a built-in id (`src/lib/focus/apps.ts`) or one your manifest introduces |
| `source` | no | An opaque session id matching `/^[A-Za-z0-9_-]{1,64}$/`. Use the first 16 hex characters of sha256 of the native id |
| `at` | no | Epoch ms or ISO time within the last day. Defaults to when the event arrives |
| `via` | yes, for marketplace connectors | Your connector's `id`, so FocusDeck can show whether it is working |

Send events with `POST {FOCUSDECK_URL}/api/sensor/events` and
`Content-Type: application/json`. If `FOCUSDECK_SENSOR_TOKEN` is set, add
`Authorization: Bearer <token>`. `FOCUSDECK_URL` defaults to
`http://127.0.0.1:3000`.

`GET /api/sensor/config` returns the designated apps. It also returns their
native ids (`apps[].bundleIds`) and the site lists for designated browser
categories (`sites`). Use it to drop undesignated activity *at the sensor*.

## The rules every connector keeps

1. **Build events from constants and one hash.** Never copy or filter fields
   from a native payload: a field the host adds next year must not be able to
   ride along. Prompts, messages, titles, URLs, paths, branch names and repo
   names never leave the connector.
2. **Map or drop.** Anything you can't map onto a designated app is dropped
   on the spot, and never logged or sent.
3. **Never get in the host's way.**
   - Use short timeouts, and always exit 0.
   - Stay silent unless `FOCUSDECK_DEBUG=1`.
   - Write nothing to stdout wherever the host feeds a hook's stdout to a model.
4. **Respect `FOCUSDECK_INTERNAL=1`.** FocusDeck sets it when it runs an AI
   CLI itself (System Two on your subscription). When it is set, send nothing
   and exit 0.
5. **Zero dependencies where you can.** Use Node 18+ built-ins, a single Swift
   file, or plain browser JavaScript, so a person can read every line before
   installing it.

## manifest.json

```json
{
  "id": "codex",
  "name": "OpenAI Codex CLI",
  "publisher": "FocusDeck",
  "version": "0.1.0",
  "category": "agents",
  "summary": "One line for the card.",
  "description": "A short paragraph: what it notices, how it hooks in, and what it never does.",
  "status": "ready",
  "platforms": ["macos", "linux", "windows"],
  "emits": [{ "kind": "agent-finished", "app": "codex", "when": "A Codex turn finishes" }],
  "apps": [{ "id": "codex", "label": "Codex CLI", "group": "agents" }],
  "privacy": { "sends": ["kind", "app", "source", "via"], "neverSends": ["Your prompts", "Codex's replies"] },
  "requirements": ["Node 18+"],
  "setup": [{ "title": "Add the notify program", "body": "Optional text.", "code": { "language": "toml", "content": "notify = [\"node\", \"{{FOCUSDECK_DIR}}/sensors/codex/notify.mjs\"]" } }],
  "test": { "command": "a shell command that sends one sample event", "expect": "What the person should then see" },
  "docs": "sensors/codex/README.md"
}
```

| Field | Rule |
| --- | --- |
| `id` | Same shape as an app id. It is also the `via` your events send |
| `category` | `agents`, `editor`, `comms`, `browser`, `os`, `tasks` or `generic` |
| `status` | `ready` only if the mechanism is verified against the host's official docs and your tests pass; `spike` if any part is unverified; `planned` if there's nothing to install yet |
| `emits` | Each `app` must be built in or listed in `apps` |
| `apps` | Only apps your connector introduces, each with a `group` (`work`, `agents`, `comms`, `browser` or `tasks`) and optional `bundleIds`. A built-in id here is an error |
| `privacy.sends` | Only fields the bridge accepts. A manifest promising anything else is invalid, so the list is enforced, not just promised |
| `privacy.neverSends` | Plain words, for people |
| `setup[].code.language` | `bash`, `sh`, `powershell`, `json`, `toml`, `yaml`, `js` or `text` |
| `docs` | A relative path with no `..`: from the FocusDeck folder for connectors in `sensors/` (`sensors/codex/README.md`), from the connector's own folder elsewhere (`README.md`) |

In `setup` code and the `test` command, FocusDeck substitutes these placeholders:

- `{{FOCUSDECK_DIR}}`: the FocusDeck folder on this machine.
- `{{FOCUSDECK_URL}}`: the address the page was opened at.
- `{{CONNECTOR_DIR}}`: your connector's own folder, which is useful outside
  `sensors/`.

Inside `json` code blocks, values are JSON-escaped, so Windows paths stay valid.

## Tests to write

Mirror `sensors/claude-code/mapping.test.ts`:

- the mapping table, input by input;
- content never leaks, even when the input is salted with secrets;
- hashing is stable and opaque;
- every event passes the bridge's own `parseSensorEvent`;
- `FOCUSDECK_INTERNAL=1` sends nothing;
- the real script, spawned against a closed port, exits 0 and prints nothing.

`src/lib/connectors/manifest.test.ts` validates every manifest in `sensors/`
on each test run, so a broken manifest fails CI.

Run:

```sh
npx vitest run sensors/<folder> src/lib/connectors
npx eslint sensors/<folder>
```
