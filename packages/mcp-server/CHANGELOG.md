# Changelog

## 2.0.0

Major, because tool output shapes and the daily-note location both changed. If
you only use this server through an AI client, nothing is required of you —
update and carry on. If you parse tool output yourself, read "Breaking" below.

### Breaking

**Two tools return objects instead of bare arrays.** MCP requires structured
output to be a JSON object, and both tools now declare an `outputSchema`:

```jsonc
// search_notes — was: [ { title, ... }, ... ]
{ "query": "roadmap", "returned": 3, "results": [ { "title": "...", ... } ] }

// get_tags — was: [ { tag, count, notes }, ... ]
{ "tags": [ { "tag": "#project", "count": 4, "notes": ["Projects/Roadmap.md"] } ] }
```

Migration: read `.results` and `.tags` respectively.

**`list_notes` is paginated and its shape changed.** It returned a bare array of
every note; it now returns `{ total, offset, returned, notes }` and defaults to
50 (max 200). On a 2,000-note vault the old response serialised roughly 75k
tokens, enough to exhaust a model's context on its own. Migration: read `.notes`,
and page with `offset` when `total` exceeds what you received.

**Daily notes moved to the vault root.** The server wrote
`Daily/YYYY-MM-DD.md`, while the Marky app writes `YYYY-MM-DD.md` at the vault
root — so the app and an AI client created two unrelated notes for the same day,
and `daily_review` found nothing in a real vault. The server now writes where
the app does. **No migration is needed:** notes created by 1.x under `Daily/`
are still found, appended to, and included in reviews.

**`create_note` no longer returns `fullPath`**, an absolute machine path with no
use to a model. Use `relativePath`.

### Security

- **Vault containment.** `create_note` accepted a `folder` containing `..` and
  wrote outside the vault. That argument is chosen by a model, so a note
  carrying injected instructions could have steered a write anywhere the user
  can write. Every write now resolves against the vault root and is refused if
  it escapes; an absolute `folder` is treated as vault-relative.
- **Read-only mode** via `--read-only` or `MARKY_READ_ONLY=1`.
- **Guarded overwrites.** `update_note` accepts `expected_hash` from a previous
  `read_note` and refuses the write if the note changed in between, so a
  whole-file rewrite cannot silently discard an edit made in the app.

### Fixed

- `search_notes` ignored its `limit`: a schema ordering mistake made the default
  resolve to `undefined`, so every search returned its entire result set.
- Note lookup no longer matches across a name boundary, so `Note.md` cannot
  resolve to `MyNote.md`.
- Dates are parsed in local time. `new Date("2026-08-18")` is UTC and could land
  on the previous day west of Greenwich.

### Performance

The index was rebuilt from disk on every call, and `read_note` built it twice.
Measured on 2,000 notes: a cold read halves from 4,000 file reads to 2,000,
repeat calls do no disk I/O, and changing one note re-reads exactly that file.
Files over 2 MB are indexed by metadata only and read on demand.

### Protocol

- Tool annotations: six tools marked `readOnlyHint`, `update_note` marked
  `destructiveHint`, so clients can auto-approve reads separately from writes.
- Every tool declares an `outputSchema` and returns `structuredContent`.
- Resources gained descriptions and a `list` callback, so individual notes are
  discoverable rather than guessable, plus completion for the path argument.
- Added server instructions, `--version`, and SIGINT/SIGTERM shutdown.

### Internal

The package had no working test configuration and its suite had never run. It
now has one, with 30 tests covering vault containment, result limits, the
daily-note contract, concurrent-edit refusal, and every tool's declared output
schema.

## 1.0.0

Initial release: 10 tools, 3 resources, and 3 prompts over stdio.
