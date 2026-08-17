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

| Tool Name                     | Parameters                              | Description                                                                      |
| :---------------------------- | :-------------------------------------- | :------------------------------------------------------------------------------- |
| `search_notes`                | `query`, `tag?`, `folder?`, `limit?`    | Fuzzy search across note titles, tags, and body content.                         |
| `read_note`                   | `path_or_title`                         | Read markdown body, frontmatter properties, tags, outgoing links, and backlinks. |
| `create_note`                 | `title`, `folder?`, `content?`, `tags?` | Create a new `.md` note with optional frontmatter attributes and tags.           |
| `update_note`                 | `path_or_title`, `content`              | Replace the entire content of an existing note.                                  |
| `append_to_note`              | `path_or_title`, `content`              | Append markdown text or sections to the end of an existing note.                 |
| `list_notes`                  | `folder?`, `tag?`                       | List notes with folder, tag, size, and modified date filters.                    |
| `get_vault_structure`         | _(none)_                                | Return the complete directory tree hierarchy of the vault.                       |
| `get_backlinks`               | `title`                                 | Find all notes that link to a specific note via `[[WikiLinks]]`.                 |
| `get_tags`                    | _(none)_                                | List all hashtags (`#tag`) and frontmatter tags with note counts.                |
| `create_or_append_daily_note` | `date?`, `content?`                     | Create or log entries to a Daily Note (`Daily/YYYY-MM-DD.md`).                   |

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
