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

- **`search_notes`**: Fuzzy search titles, content, and tags using Fuse.js.
- **`read_note`**: Read full markdown content, frontmatter properties, tags, and backlinks.
- **`create_note`**: Create a new note with folder hierarchy, frontmatter, and tags.
- **`update_note`**: Safely replace full note content.
- **`append_to_note`**: Append logs or sections to existing notes.
- **`list_notes`**: List notes with folder and tag filters.
- **`get_vault_structure`**: Return the complete directory tree hierarchy.
- **`get_backlinks`**: Inspect all incoming `[[WikiLinks]]` to a note.
- **`get_tags`**: List all `#tags` and frontmatter tags with note counts.
- **`create_or_append_daily_note`**: Create or log entries to `Daily/YYYY-MM-DD.md`.

---

## 📄 License

MIT. See [LICENSE](https://github.com/amiralibg/marky/blob/main/LICENSE).
