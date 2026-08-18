import { useState } from "react";
import useNotesStore from "../../store/notesStore";
import useUIStore from "../../store/uiStore";

const iconProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  viewBox: "0 0 24 24",
  "aria-hidden": true,
};

const SearchIcon = (props) => (
  <svg {...iconProps} {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const LinkIcon = (props) => (
  <svg {...iconProps} {...props}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </svg>
);

const PencilIcon = (props) => (
  <svg {...iconProps} {...props}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

const CalendarIcon = (props) => (
  <svg {...iconProps} {...props}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 11h18" />
  </svg>
);

const CAPABILITIES = [
  {
    id: "search",
    Icon: SearchIcon,
    title: "Fuzzy search & filter",
    body: "Search your vault by title, tags, content, or a specific folder.",
  },
  {
    id: "links",
    Icon: LinkIcon,
    title: "Backlinks & wiki links",
    body: "Inspect graph connections, find backlinks, and suggest new [[links]].",
  },
  {
    id: "write",
    Icon: PencilIcon,
    title: "Read, create & append",
    body: "Draft new notes, append meeting notes, or update frontmatter.",
  },
  {
    id: "daily",
    Icon: CalendarIcon,
    title: "Daily notes workflow",
    body: "Log action items or review recent daily notes for standup reports.",
  },
];

const CLIENTS = [
  { id: "claude-desktop", label: "Claude Desktop" },
  { id: "claude-code", label: "Claude Code" },
  { id: "cursor", label: "Cursor" },
  { id: "opencode", label: "OpenCode / Cline" },
  { id: "chatgpt", label: "ChatGPT (macOS)" },
  { id: "zed", label: "Zed Editor" },
  { id: "cli", label: "CLI / Stdio" },
];

const McpSettings = () => {
  const [selectedClient, setSelectedClient] = useState("claude-desktop");
  const [copied, setCopied] = useState(false);
  const rootFolderPath = useNotesStore((state) => state.rootFolderPath);
  const addNotification = useUIStore((state) => state.addNotification);

  const vaultPath = rootFolderPath || "/path/to/your/marky/vault";

  const standardMcpJson = {
    mcpServers: {
      marky: {
        command: "npx",
        args: ["-y", "@marky-app/mcp-server", vaultPath],
      },
    },
  };

  const zedConfig = {
    context_servers: {
      marky: {
        command: "npx",
        args: ["-y", "@marky-app/mcp-server", vaultPath],
      },
    },
  };

  const claudeCodeCommand = `claude mcp add marky -- npx -y @marky-app/mcp-server "${vaultPath}"`;
  const cliCommand = `npx -y @marky-app/mcp-server "${vaultPath}"`;

  const getActiveSnippet = () => {
    switch (selectedClient) {
      case "claude-desktop":
      case "cursor":
      case "opencode":
        return JSON.stringify(standardMcpJson, null, 2);
      case "claude-code":
        return claudeCodeCommand;
      case "zed":
        return JSON.stringify(zedConfig, null, 2);
      case "chatgpt":
        return `Name: marky\nCommand: npx\nArguments: -y @marky-app/mcp-server "${vaultPath}"`;
      case "cli":
        return cliCommand;
      default:
        return JSON.stringify(standardMcpJson, null, 2);
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
        <strong className="text-text-primary">Claude Code</strong>,{" "}
        <strong className="text-text-primary">Claude Desktop</strong>,{" "}
        <strong className="text-text-primary">Cursor</strong>,{" "}
        <strong className="text-text-primary">OpenCode / Cline</strong>, or{" "}
        <strong className="text-text-primary">ChatGPT</strong> directly to your Marky notes using
        the <span className="font-medium text-accent">Model Context Protocol (MCP)</span>.
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
        <span
          className={`text-[11px] px-2 py-0.5 rounded font-medium shrink-0 ${
            rootFolderPath
              ? "bg-accent-dim text-accent"
              : "bg-bg-sidebar text-text-muted border border-border"
          }`}
        >
          {rootFolderPath ? "Ready for MCP" : "No workspace"}
        </span>
      </div>

      {/* Client Selector & Snippet */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex flex-wrap rounded-lg bg-bg-base p-1 border border-border gap-1">
            {CLIENTS.map((client) => (
              <button
                key={client.id}
                onClick={() => setSelectedClient(client.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  selectedClient === client.id
                    ? "bg-accent text-accent-contrast shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {client.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-contrast hover:opacity-90 transition-opacity shrink-0"
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
          {selectedClient === "claude-desktop" && (
            <>
              Paste into your <code className="text-text-primary">claude_desktop_config.json</code>{" "}
              under <code className="text-text-primary">~/Library/Application Support/Claude/</code>{" "}
              (macOS) or <code className="text-text-primary">%APPDATA%\Claude\</code> (Windows).
            </>
          )}
          {selectedClient === "claude-code" && (
            <>
              Run this command in your terminal to instantly attach your Marky notes to{" "}
              <code className="text-text-primary">Claude Code</code> CLI sessions.
            </>
          )}
          {selectedClient === "cursor" && (
            <>
              Add to your project's <code className="text-text-primary">.cursor/mcp.json</code> or
              global Cursor MCP Settings.
            </>
          )}
          {selectedClient === "opencode" && (
            <>
              Add to <code className="text-text-primary">OpenCode</code>,{" "}
              <code className="text-text-primary">Cline</code>, or{" "}
              <code className="text-text-primary">Roo Code</code> MCP settings configuration.
            </>
          )}
          {selectedClient === "chatgpt" && (
            <>
              In ChatGPT macOS App: Go to{" "}
              <strong className="text-text-primary">Settings → Developer → MCP Servers</strong> and
              add these server details.
            </>
          )}
          {selectedClient === "zed" && (
            <>
              Add to your Zed Editor <code className="text-text-primary">settings.json</code> under
              the <code className="text-text-primary">context_servers</code> section.
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
          Available AI Capabilities Across All Clients
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {CAPABILITIES.map(({ id, Icon, title, body }) => (
            <div key={id} className="p-3 rounded-lg bg-bg-base border border-border">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-text-primary mb-0.5">
                <Icon className="w-3.5 h-3.5 shrink-0 text-accent" />
                {title}
              </span>
              <p className="text-[11px] text-text-muted">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default McpSettings;
