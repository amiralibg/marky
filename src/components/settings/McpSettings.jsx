import { useState } from "react";
import useNotesStore from "../../store/notesStore";
import useUIStore from "../../store/uiStore";

const McpSettings = () => {
  const [selectedClient, setSelectedClient] = useState("claude");
  const [copied, setCopied] = useState(false);
  const rootFolderPath = useNotesStore((state) => state.rootFolderPath);
  const addNotification = useUIStore((state) => state.addNotification);

  const vaultPath = rootFolderPath || "/path/to/your/marky/vault";

  const claudeConfig = {
    mcpServers: {
      marky: {
        command: "npx",
        args: ["-y", "@marky-app/mcp-server", vaultPath],
      },
    },
  };

  const cursorConfig = {
    mcpServers: {
      marky: {
        command: "npx",
        args: ["-y", "@marky-app/mcp-server", vaultPath],
      },
    },
  };

  const cliCommand = `npx -y @marky-app/mcp-server "${vaultPath}"`;

  const getActiveSnippet = () => {
    switch (selectedClient) {
      case "claude":
        return JSON.stringify(claudeConfig, null, 2);
      case "cursor":
        return JSON.stringify(cursorConfig, null, 2);
      case "cli":
        return cliCommand;
      default:
        return JSON.stringify(claudeConfig, null, 2);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getActiveSnippet());
      setCopied(true);
      addNotification("Configuration copied to clipboard", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      addNotification("Failed to copy to clipboard", "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-sm text-text-secondary leading-relaxed">
        Connect external AI assistants like{" "}
        <strong className="text-text-primary">Claude Desktop</strong>,{" "}
        <strong className="text-text-primary">Cursor</strong>, or{" "}
        <strong className="text-text-primary">Antigravity</strong> directly to your Marky notes
        using the <span className="font-medium text-accent">Model Context Protocol (MCP)</span>.
      </div>

      {/* Active Vault Path Badge */}
      <div className="flex items-center justify-between p-3.5 rounded-lg bg-bg-base border border-border">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Active Workspace Path
          </span>
          <span className="text-xs font-mono text-text-primary truncate max-w-md">
            {rootFolderPath || "No workspace opened yet"}
          </span>
        </div>
        <span className="text-[11px] px-2 py-0.5 rounded bg-accent-dim text-accent font-medium">
          Ready for MCP
        </span>
      </div>

      {/* Client Selector & Snippet */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex rounded-lg bg-bg-base p-1 border border-border">
            <button
              onClick={() => setSelectedClient("claude")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                selectedClient === "claude"
                  ? "bg-accent text-accent-contrast shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Claude Desktop
            </button>
            <button
              onClick={() => setSelectedClient("cursor")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                selectedClient === "cursor"
                  ? "bg-accent text-accent-contrast shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Cursor
            </button>
            <button
              onClick={() => setSelectedClient("cli")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                selectedClient === "cli"
                  ? "bg-accent text-accent-contrast shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              CLI / Terminal
            </button>
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-contrast hover:opacity-90 transition-opacity"
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Copy Config
              </>
            )}
          </button>
        </div>

        {/* Code Snippet Box */}
        <div className="relative rounded-lg bg-bg-base border border-border p-4 font-mono text-xs text-text-secondary overflow-x-auto custom-scrollbar">
          <pre>{getActiveSnippet()}</pre>
        </div>

        <p className="text-[11px] text-text-muted">
          {selectedClient === "claude" && (
            <>
              Paste into your <code className="text-text-primary">claude_desktop_config.json</code>{" "}
              under <code className="text-text-primary">~/Library/Application Support/Claude/</code>{" "}
              (macOS) or <code className="text-text-primary">%APPDATA%\Claude\</code> (Windows).
            </>
          )}
          {selectedClient === "cursor" && (
            <>
              Add to your project's <code className="text-text-primary">.cursor/mcp.json</code> or
              global Cursor Settings.
            </>
          )}
          {selectedClient === "cli" && (
            <>Run this command directly in your terminal to start the MCP server over stdio.</>
          )}
        </p>
      </div>

      {/* Available Tools Grid */}
      <div className="space-y-3 pt-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Available AI Capabilities
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <div className="p-3 rounded-lg bg-bg-base border border-border">
            <span className="text-xs font-semibold text-text-primary block mb-0.5">
              🔍 Fuzzy Search & Filter
            </span>
            <p className="text-[11px] text-text-muted">
              AI can search your vault by title, tags, content, or specific folder.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-bg-base border border-border">
            <span className="text-xs font-semibold text-text-primary block mb-0.5">
              🔗 Backlinks & WikiLinks
            </span>
            <p className="text-[11px] text-text-muted">
              AI can inspect graph connections, find backlinks, and suggest new{" "}
              <code className="text-accent">[[links]]</code>.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-bg-base border border-border">
            <span className="text-xs font-semibold text-text-primary block mb-0.5">
              ✍️ Read, Create & Append
            </span>
            <p className="text-[11px] text-text-muted">
              AI can draft new notes, append meeting notes, or update frontmatter.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-bg-base border border-border">
            <span className="text-xs font-semibold text-text-primary block mb-0.5">
              📅 Daily Notes Workflow
            </span>
            <p className="text-[11px] text-text-muted">
              AI can log action items or review your daily notes for standup reports.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default McpSettings;
