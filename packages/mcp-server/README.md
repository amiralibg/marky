# @marky-app/mcp-server

Model Context Protocol (MCP) Server for [Marky](https://github.com/amiralibg/marky) markdown notes vaults.

Connect external AI assistants such as **Claude Code**, **Claude Desktop**, **Cursor**, **OpenCode / Cline**, **ChatGPT**, **Zed**, and **Antigravity** directly to your local Marky notes vault over standard I/O (stdio).

---

## ⚡ Quick Usage

Run without installing via `npx`:

```bash
npx -y @marky-app/mcp-server /path/to/your/marky/vault
```

Or set the environment variable:

```bash
export MARKY_VAULT_PATH="/path/to/your/marky/vault"
npx -y @marky-app/mcp-server
```

---

## 💻 Configuration

### Claude Code (CLI)

```bash
claude mcp add marky -- npx -y @marky-app/mcp-server /path/to/your/notes
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "marky": {
      "command": "npx",
      "args": ["-y", "@marky-app/mcp-server", "/Users/yourname/Documents/MarkyNotes"]
    }
  }
}
```

### Cursor / OpenCode / Cline / Roo Code

Add to `.cursor/mcp.json` or `.mcp.json`:

```json
{
  "mcpServers": {
    "marky": {
      "command": "npx",
      "args": ["-y", "@marky-app/mcp-server", "/path/to/your/notes"]
    }
  }
}
```

### ChatGPT Desktop (macOS)

In **Settings → Developer → MCP Servers**, add:

- **Command**: `npx`
- **Arguments**: `-y @marky-app/mcp-server /path/to/your/notes`

### Zed Editor

In `settings.json`:

```json
{
  "context_servers": {
    "marky": {
      "command": "npx",
      "args": ["-y", "@marky-app/mcp-server", "/path/to/your/notes"]
    }
  }
}
```

---

## 🛠️ Features & Tools

- **`search_notes`**: Fuzzy search titles, content, and tags using Fuse.js. 20 results by default, 50 max.
- **`read_note`**: Read full markdown content, frontmatter properties, tags, backlinks, and a content `hash`.
- **`create_note`**: Create a new note with folder hierarchy, frontmatter, and tags.
- **`update_note`**: Replace full note content, optionally guarded by `expected_hash`.
- **`append_to_note`**: Append logs or sections to existing notes.
- **`list_notes`**: List notes with folder and tag filters. Paginated with `limit`/`offset` and a `total`.
- **`get_vault_structure`**: Return the complete directory tree hierarchy.
- **`get_backlinks`**: Inspect all incoming `[[WikiLinks]]` to a note.
- **`get_tags`**: List all `#tags` and frontmatter tags with note counts.
- **`create_or_append_daily_note`**: Create or log entries to `YYYY-MM-DD.md` at the vault root.

Read-only tools carry MCP `readOnlyHint` annotations so clients can auto-approve them independently of writes; `update_note` is marked `destructiveHint` because it rewrites the whole file.

Every tool declares an `outputSchema` and returns `structuredContent` alongside the usual text block, so results can be consumed as typed JSON. MCP requires structured output to be a JSON object, so `search_notes` returns `{ query, returned, results }` and `get_tags` returns `{ tags }` rather than bare arrays.

## 🔒 Safety

Run with `--read-only` (or `MARKY_READ_ONLY=1`) to expose only the read tools:

```bash
npx -y @marky-app/mcp-server /path/to/your/notes --read-only
```

Every path argument is resolved against the vault root and refused if it escapes — a `folder` of `../../etc` is an error, not a write. There is deliberately no `delete_note` or `rename_note`; destructive file operations stay in the app.

### Concurrent edits

`update_note` replaces the entire file. To avoid clobbering an edit you made in the app between the read and the write, pass the `hash` returned by `read_note` as `expected_hash` — the write is refused if the note changed in the meantime.

### Daily notes

Daily notes are written to the vault root as `YYYY-MM-DD.md`, matching the Marky app, so both write to the same note. Notes created by earlier versions under `Daily/` are still found and appended to.

---

## 📄 License

MIT. See [LICENSE](https://github.com/amiralibg/marky/blob/main/LICENSE).
