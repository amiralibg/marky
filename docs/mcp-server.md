# Marky MCP (Model Context Protocol) Server

Connect your Marky Markdown notes with AI clients such as **Claude Desktop**, **Cursor**, **Antigravity**, **VS Code**, and **Zed** via the standard Model Context Protocol.

---

## ⚡ Quick Start

You can run the MCP server directly using `npx`:

```bash
npx -y @marky-app/mcp-server /path/to/your/marky/vault
```

Or set the `MARKY_VAULT_PATH` environment variable:

```bash
export MARKY_VAULT_PATH="/path/to/your/marky/vault"
npx -y @marky-app/mcp-server
```

---

## 💻 Client Configuration

### 1. Claude Desktop

Add the following to your `claude_desktop_config.json`:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

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

Restart Claude Desktop, and you will see the Marky tools and prompts available in the tool picker (🔨 icon).

---

### 2. Cursor IDE

Add to your project's `.cursor/mcp.json` or your global Cursor Settings:

```json
{
  "mcpServers": {
    "marky": {
      "command": "npx",
      "args": ["-y", "@marky-app/mcp-server", "/path/to/your/marky/vault"]
    }
  }
}
```

---

### 3. In-App Marky Settings

Inside Marky:

1. Open **Settings** (`Cmd/Ctrl+,`).
2. Go to **AI & MCP**.
3. Your active workspace path is automatically inserted into the config snippet.
4. Click **Copy Config** and paste it into your AI client.

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
