# Plugin system — design plan

Status: not started. This is a design doc, not a spec of shipped behaviour.

## Goal

Let a Marky user add commands, automations, and eventually UI to their own vault without
building the app from source — the thing SilverBullet users mean when they say "plugs".
The success condition is that someone can write ten lines of JavaScript, save the file,
and have a new entry in the command palette bound to a key of their choosing.

Non-goals, at least for the phases below:

- A plugin marketplace or registry service.
- Plugins that render arbitrary React into the app shell.
- Server-side / headless plugin execution. Marky is a desktop app; there is no server.
- Compatibility with SilverBullet's own `.plug.js` format. Similar idea, different host.

## Prior art: what SilverBullet actually does

Two layers, worth keeping straight because they have very different costs.

**Plugs** are packaged extensions, bundled into a single `.plug.js`, declared by a manifest
that maps exported functions to triggers (`command:` with a name and keybinding, `events:`,
and an `env:` of client or server). They execute in web workers and reach the app only
through a syscall bridge — `editor.*`, `space.*`, `index.*`, `system.*`. Installation is a
URI on a `PLUGS` page plus a "Plugs: Update" command.

**Space Lua** (formerly Space Script, which was JS) is code written directly inside the
user's own notes, in fenced blocks:

    ```space-lua
    command.define {
      name = "Insert Timestamp",
      run = function() editor.insertAtCursor(os.date("%Y-%m-%d %H:%M")) end
    }
    ```

No build step, no install, no restart. This is the layer people actually rave about, and
it is roughly 20% of the work of the plug system for most of the perceived value.

The lesson to take: **ship the scripting layer first, the packaging layer only if demand
appears.** The plan below is ordered accordingly.

## Core decision: workers, not eval

Marky ships with `"csp": null` (`src-tauri/tauri.conf.json`) and an `fs:scope` of `**`
(`src-tauri/capabilities/default.json`). Any third-party JavaScript evaluated on the main
thread inherits `window.__TAURI_INTERNALS__` and therefore has read/write access to the
entire filesystem under the user's identity. For a notes app, "install a plugin, lose your
SSH keys" is not an acceptable failure mode.

A `Worker` has no `__TAURI_INTERNALS__`. The isolation is structural rather than a promise,
it costs zero bundle bytes (relevant — the budget is 13 MB), and Vite bundles workers
natively via `new Worker(new URL("./host.worker.js", import.meta.url), { type: "module" })`.

Alternatives considered and rejected:

| Approach                                       | Verdict                                                                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Web Worker + syscall bridge                    | **Chosen.** ~0 KB, structural isolation, matches SilverBullet.                                                              |
| `mlua` in Rust                                 | ~300 KB, safe, but plugins could never touch CodeMirror or the DOM. Revisit only if the JS API proves impossible to secure. |
| QuickJS / Deno-core embedded                   | Megabytes of binary for no advantage over a worker. No.                                                                     |
| `eval` / dynamic `import()` on the main thread | Rejected. See above.                                                                                                        |

The bridge is the security boundary, so it holds the invariants: every path a plugin names
is resolved and checked to be inside the current vault root before any disk call, and no
Tauri function is ever passed into the worker.

## Phase 0 — Command registry

Prerequisite for everything else, and worth doing on its own merits.

Today commands are a hardcoded array literal inside a React component
(`src/components/modals/CommandPalette.jsx:47`) whose entries carry a string `action`,
dispatched by a ~150-line switch in `src/App.jsx:341`. Nothing outside those two files can
contribute a command.

Work:

- New `src/plugins/commandRegistry.js` — a zustand store (or plain module + subscription)
  holding `{ id, name, category, icon, keywords, run }`. `run` is a function, not a string.
- `App.jsx` registers the built-in commands at mount, replacing the switch with handler
  functions. Keep the `action` string ids as the registry keys so existing keymaps and the
  `menu://command-palette` wiring keep working.
- `CommandPalette.jsx` reads from the registry instead of building the array. Its fuzzy
  search and category grouping stay as they are.

**Gotcha:** `sanitizeKeymaps` in `src/store/settingsStore.js:326` drops any `actionId` not
present in `DEFAULT_KEYMAPS`. As written, a plugin-registered keybinding would be silently
discarded on the next persist/rehydrate cycle. This needs to validate against
`DEFAULT_KEYMAPS` merged with the live registry, and must preserve unknown ids rather than
deleting them — a plugin that is temporarily disabled should not lose its keybinding.

Acceptance: the palette behaves identically, `App.jsx` loses the switch, and a test can
register a command and find it in the palette.

Estimate: a day or two. Low risk, no user-visible change.

## Phase 1 — Vault scripts

The Space Script equivalent, and the phase that delivers the feature.

Scripts live at `.marky/scripts/*.js` inside the vault. They are loaded into one worker per
window at workspace load, and re-run when the files change.

    // .marky/scripts/timestamp.js
    marky.command({
      id: "insert-timestamp",
      name: "Insert Timestamp",
      key: "mod+shift+;",
      run: async () => {
        await marky.editor.insertAtCursor(new Date().toISOString().slice(0, 16));
      },
    });

Work:

- `src/plugins/host.worker.js` — the worker. Loads script sources passed in from the main
  thread, exposes the `marky.*` global, posts registrations back.
- `src/plugins/bridge.js` — main-thread half. Owns the message protocol (request id →
  promise), enforces the vault-root path check, and translates syscalls into store calls.
- `src/plugins/api.js` — the syscall surface (below), the only thing plugins can reach.
- `src/plugins/loader.js` — reads `.marky/scripts`, spawns the worker, handles reload,
  surfaces script errors as `uiStore` notifications rather than swallowing them.

**Gotcha:** the Rust walker sets `.hidden(true)` (`src-tauri/src/main.rs:695`), so `.marky/`
is invisible to the note scanner. That is exactly what we want for the sidebar, but
`watch_folder` uses the same walker, so hot-reload needs its own watch on `.marky/scripts`
rather than riding on the existing file watcher.

Estimate: one to two weeks. This is the bulk of the project.

### Syscall surface

Do not expose the stores. `src/store/notesStore.js` is 2400 lines, is free to churn, and
half of it is internal bookkeeping. `src/plugins/api.js` is an adapter, and it is a public
contract from the day a third party writes against it.

Mirror the MCP tool vocabulary in `packages/mcp-server/src/tools.js` — `search_notes`,
`read_note`, `create_note`, `update_note`, `append_to_note`, `list_notes`,
`get_vault_structure`, `get_backlinks`, `get_tags`, `create_or_append_daily_note`. That
surface is already designed, already tested, and already documented for AI callers. One
conceptual API for both agents and plugins is worth a lot, and it means `space.*` is mostly
a thin re-export rather than new design work.

| Namespace              | Backed by                           | Notes                                                                                                                  |
| ---------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `marky.space.*`        | `notesStore` + `utils/fileSystem`   | Mirrors the MCP tools. All async.                                                                                      |
| `marky.editor.*`       | CodeMirror view on the main thread  | Transaction-based: `insertAtCursor`, `replaceRange`, `getSelection`, `getContent`.                                     |
| `marky.ui.*`           | `uiStore`                           | `notify()`, and later `prompt()` / `pick()`.                                                                           |
| `marky.settings.*`     | `settingsStore`                     | Read-only for now, plus a per-plugin namespaced bucket.                                                                |
| `marky.store.*`        | new, following `utils/sideStore.js` | Per-plugin KV on disk. Not `localStorage` — see the quota comment at the top of `sideStore.js`.                        |
| `marky.markdown.*`     | `packages/mcp-server/src/vault.js`  | `parseFrontmatter`, `extractWikiLinks`, `extractInlineTags` are pure, dependency-free, already tested. Re-export them. |
| `marky.events.on(...)` | new                                 | `note:opened`, `note:saved`, `vault:loaded` to start.                                                                  |

Everything is async, including things that feel synchronous. A plugin cannot synchronously
transform text on its way to the editor; the API has to make that obvious rather than
pretending otherwise.

## Phase 2 — Packaged plugins

Only if Phase 1 gets used. A manifest, a folder per plugin under `.marky/plugins/<name>/`,
a declared permission set shown at install time, an enable/disable list in settings, and an
install flow that takes a git URL or a local folder.

The permission model is the point: a plugin declares `["space:read", "space:write",
"net"]`, the user sees that list before it ever runs, and the bridge refuses undeclared
syscalls. Phase 1 scripts are implicitly fully trusted because the user typed them; a
downloaded plugin is not.

**Threat model note:** `.marky/` sits inside the vault, so git sync and S3 sync will carry
scripts between machines. That is a genuine feature — your automations follow your notes —
and also means "sync a vault" starts meaning "sync executable code". Worth a line in the
sync docs and an explicit prompt the first time a synced script appears that this machine
has not seen before.

Estimate: a week, mostly UI and flow rather than architecture.

## Phase 3 — UI extension points

The expensive one. Do it last, and only for surfaces there is real demand for.

- **Preview post-processing** — a hook after `renderMarkdownPreview`
  (`src/components/editor/markdownPreview.js:339`) to transform the rendered HTML. Cheapest
  useful surface, and it covers custom block rendering.
- **Sidebar panels** — a slot for plugin-contributed panels. Needs a rendering story that
  is not "arbitrary React from a worker".
- **Editor decorations** — hardest. CodeMirror `Decoration` objects are live and tied to the
  view, so they cannot be constructed in a worker. The protocol has to be declarative: the
  plugin returns `{ from, to, class }` ranges, and the main thread builds the decoration
  set. Design this before promising it.

## Open questions

1. **Which window hosts plugins?** Capabilities cover `main`, `note-*`, `vault-*`,
   `window-*`. One worker per window is simple and isolated but multiplies script runs and
   makes "run once on vault load" ambiguous. A single host in the main window is cleaner
   semantically but breaks when the main window is closed and a note window survives.
   Leaning: one worker per window, with events scoped to that window's vault.
2. **JS or Lua for the script layer?** JS needs no new dependency and every user already
   knows it. Lua via `mlua` is a smaller and more contained sandbox but cannot touch the
   editor. Leaning JS, given the worker gives us the isolation Lua would have bought.
3. **Do slash commands get an extension point in Phase 1 or Phase 3?** They live in
   `src/components/editor/wikiLinkAutocomplete.js:113` and are a static list. Cheap to open
   up, high perceived value, but it is an editor surface. Probably worth pulling forward.
4. **API versioning.** A `marky.version` and a manifest `apiVersion` from day one, or add it
   when the first breaking change lands? Cheaper now than later.

## Where to start

Phase 0. It is self-contained, it improves `App.jsx` whether or not plugins ever ship, and
it is the thing every later phase blocks on. The `sanitizeKeymaps` fix is the only part
that touches persisted user data, so it wants a test.

Tests go beside the code as `.test.js`, per the existing convention across `src/utils/`.
