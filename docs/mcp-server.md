# Marky MCP (Model Context Protocol) Server

Connect your Marky Markdown notes with any MCP-compatible AI assistant — including **Claude Code**, **Claude Desktop**, **Cursor**, **OpenCode / Cline / Roo Code**, **ChatGPT Desktop**, **Zed**, and **Antigravity** — via the standard Model Context Protocol.

---

## ⚡ Quick Start

Run the MCP server directly using `npx`:

```bash
npx -y @marky-app/mcp-server /path/to/your/marky/vault
```

Or set the `MARKY_VAULT_PATH` environment variable:

```bash
export MARKY_VAULT_PATH="/path/to/your/marky/vault"
npx -y @marky-app/mcp-server
```

---

## 💻 Client Configuration Guides

### 1. 🤖 Claude Code (CLI)

Add Marky to your Claude Code CLI sessions with one command:

```bash
claude mcp add marky -- npx -y @marky-app/mcp-server /path/to/your/notes
```

Or add it to your `~/.claude/mcp.json` or project `.claude/mcp.json`:

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

---

### 2. 🖥️ Claude Desktop

Add to your `claude_desktop_config.json`:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

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

---

### 3. 🖱️ Cursor IDE

Add to your project's `.cursor/mcp.json` or your global Cursor Settings:

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

---

### 4. 🌐 OpenCode / Cline / Roo Code / Continue.dev

In your extension or CLI MCP settings file (`.mcp.json`):

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

---

### 5. 🧠 ChatGPT Desktop App (macOS)

1. Open **Settings** → **Developer** → **MCP Servers**.
2. Click **Add Server**:
   - **Name**: `marky`
   - **Command**: `npx`
   - **Arguments**: `-y @marky-app/mcp-server /path/to/your/notes`

---

### 6. ⚡ Zed Editor

Add to your Zed `settings.json`:

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

### 7. 🛠️ In-App Marky Settings

Inside Marky:

1. Open **Settings** (`Cmd/Ctrl+,`).
2. Go to **AI & MCP**.
3. Choose your client (Claude Desktop, Claude Code, Cursor, OpenCode, ChatGPT, Zed).
4. Click **Copy Config** (your current workspace path is automatically inserted).

---

## 🛠️ Available MCP Tools

Read-only tools are annotated with `readOnlyHint`, so clients can auto-approve them separately from writes. `update_note` is annotated `destructiveHint` because it replaces the whole file.

Every tool also declares an `outputSchema` and returns `structuredContent`, so a client can consume results as typed JSON instead of re-parsing prose. The human-readable `content` block is still sent alongside. Because MCP requires structured output to be a JSON object, `search_notes` and `get_tags` wrap their results:

```jsonc
// search_notes
{ "query": "roadmap", "returned": 3, "results": [ /* ... */ ] }
// get_tags
{ "tags": [ { "tag": "#project", "count": 4, "notes": ["Projects/Roadmap.md"] } ] }
```

Failed calls return `isError` with a message and no `structuredContent`.

| Tool Name                     | Parameters                                   | Description                                                                                         |
| :---------------------------- | :------------------------------------------- | :-------------------------------------------------------------------------------------------------- |
| `search_notes`                | `query`, `tag?`, `folder?`, `limit?`         | Fuzzy search across note titles, tags, and body content. Returns 20 by default, 50 max.             |
| `read_note`                   | `path_or_title`                              | Read markdown body, frontmatter, tags, links, backlinks, and a content `hash`.                      |
| `create_note`                 | `title`, `folder?`, `content?`, `tags?`      | Create a new `.md` note with optional frontmatter attributes and tags.                              |
| `update_note`                 | `path_or_title`, `content`, `expected_hash?` | Replace the entire content of an existing note. Pass `expected_hash` to make the write conditional. |
| `append_to_note`              | `path_or_title`, `content`                   | Append markdown text or sections to the end of an existing note.                                    |
| `list_notes`                  | `folder?`, `tag?`, `limit?`, `offset?`       | List notes with folder and tag filters. Paginated: 50 by default, 200 max, with a `total` count.    |
| `get_vault_structure`         | _(none)_                                     | Return the complete directory tree hierarchy of the vault.                                          |
| `get_backlinks`               | `title`                                      | Find all notes that link to a specific note via `[[WikiLinks]]`.                                    |
| `get_tags`                    | _(none)_                                     | List all hashtags (`#tag`) and frontmatter tags with note counts.                                   |
| `create_or_append_daily_note` | `date?`, `content?`                          | Create or log entries to the daily note (`YYYY-MM-DD.md` at the vault root).                        |

### Daily notes

Daily notes are written to the **vault root** as `YYYY-MM-DD.md` — the same location and filename the Marky app uses — so the app and your AI client share one note per day rather than creating two.

Servers before v2.0.0 wrote to `Daily/YYYY-MM-DD.md`. Those notes are still found, appended to, and included in `daily_review`, so existing vaults keep working without migration.

### Read-only mode

To expose only the read tools and refuse every write:

```bash
npx -y @marky-app/mcp-server /path/to/your/notes --read-only
```

`MARKY_READ_ONLY=1` does the same. Useful when connecting a client you would rather not let edit your vault.

### Safety

- Every path argument is resolved and checked against the vault root; a `folder` containing `..` is refused rather than written outside the vault.
- An absolute `folder` is treated as vault-relative, never as a filesystem path.
- Files larger than 2 MB are indexed by metadata only and read on demand by `read_note`.
- There is deliberately no `delete_note` or `rename_note`. Destructive file operations stay in the app.

---

## 📄 Available MCP Resources

| URI                           | MIME Type          | Description                                       |
| :---------------------------- | :----------------- | :------------------------------------------------ |
| `marky://vault/structure`     | `application/json` | Entire workspace directory tree hierarchy.        |
| `marky://vault/tags`          | `application/json` | List of all tags and matching notes.              |
| `marky://note/{relativePath}` | `text/markdown`    | Direct markdown content of any note in the vault. |

---

## 💬 Available Prompts

- **`summarize_note`**: Generate an executive summary, key takeaways, and action items for any note.
- **`daily_review`**: Review recent daily notes and synthesize accomplishments, blockers, and next priorities.
- **`find_connections`**: Analyze a note and suggest new `[[WikiLinks]]` and tags based on the knowledge graph.
