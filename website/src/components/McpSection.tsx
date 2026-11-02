import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useReveal } from "../lib/motion";

type ClientId = "claude-code" | "claude-desktop" | "cursor" | "zed" | "chatgpt";

type Client = {
  id: ClientId;
  label: string;
  hint: string;
  snippet: string;
};

const VAULT = "/path/to/your/vault";

const STANDARD_JSON = `{
  "mcpServers": {
    "marky": {
      "command": "npx",
      "args": ["-y", "@marky-app/mcp-server", "${VAULT}"]
    }
  }
}`;

const CLIENTS: Client[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    hint: "Run it in your terminal.",
    snippet: `claude mcp add marky -- npx -y @marky-app/mcp-server "${VAULT}"`,
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    hint: "Add to claude_desktop_config.json.",
    snippet: STANDARD_JSON,
  },
  {
    id: "cursor",
    label: "Cursor",
    hint: "Add to .cursor/mcp.json, or the global MCP settings.",
    snippet: STANDARD_JSON,
  },
  {
    id: "zed",
    label: "Zed",
    hint: "Add to settings.json under context_servers.",
    snippet: `{
  "context_servers": {
    "marky": {
      "command": "npx",
      "args": ["-y", "@marky-app/mcp-server", "${VAULT}"]
    }
  }
}`,
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    hint: "Settings → Developer → MCP Servers, on the macOS app.",
    snippet: `Name: marky
Command: npx
Arguments: -y @marky-app/mcp-server "${VAULT}"`,
  },
];

const CAPABILITIES = [
  "Search the vault by title, tag, folder, or content",
  "Read a note with its tags, links, and backlinks",
  "Draft new notes and append to existing ones",
  "Log to today's daily note, or review the last week of them",
];

export default function McpSection() {
  const copyRef = useReveal<HTMLDivElement>();
  const panelRef = useReveal<HTMLDivElement>();
  const [active, setActive] = useState<ClientId>("claude-code");
  const [copied, setCopied] = useState(false);

  const client = CLIENTS.find((item) => item.id === active) ?? CLIENTS[0];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(client.snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the snippet is on screen to select manually */
    }
  };

  return (
    <section id="mcp" className="section-x scroll-mt-16 py-20 md:py-28">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
        <div ref={copyRef} className="reveal min-w-0">
          <p className="kicker">Model Context Protocol</p>
          <h2 className="display mt-4 text-[clamp(36px,5.5vw,64px)]">
            Your notes, in your AI assistant.
          </h2>
          <p className="lede mt-6 max-w-[30rem]">
            Marky ships an MCP server, so Claude, Cursor, Zed and ChatGPT can read and write the
            same vault you are editing. It talks over stdio on your own machine, so nothing gets
            uploaded anywhere.
          </p>

          <ul className="mt-8 flex flex-col gap-2.5">
            {CAPABILITIES.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[15px] leading-6 text-ink/80">
                <Check
                  size={16}
                  strokeWidth={2.5}
                  className="mt-1 shrink-0 text-accent-text"
                  aria-hidden
                />
                {item}
              </li>
            ))}
          </ul>

          <p className="mt-8 font-mono text-[12px] leading-5 text-ink-faint">
            Add <code>--read-only</code> if you would rather the assistant could only read.
          </p>
        </div>

        <div
          ref={panelRef}
          className="reveal paper-surface min-w-0 p-5 md:p-8"
          style={{ "--reveal-delay": "120ms" } as React.CSSProperties}
        >
          <div className="seg" role="group" aria-label="MCP client">
            {CLIENTS.map((item) => {
              const selected = item.id === active;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setActive(item.id);
                    setCopied(false);
                  }}
                  className="seg-btn"
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <p className="mt-5 text-[14px] text-ink-soft">{client.hint}</p>

          <div className="relative mt-3">
            <pre
              key={active}
              className="swap-in overflow-x-auto rounded-sm bg-ink/[0.04] p-4 pr-14 font-mono text-[12.5px] leading-6 text-ink/90"
            >
              <code>{client.snippet}</code>
            </pre>
            <button
              type="button"
              onClick={copy}
              className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-sm border border-line bg-surface text-ink/70 transition-colors duration-200 hover:text-ink"
              aria-label={copied ? "Copied" : `Copy ${client.label} configuration`}
            >
              {copied ? <Check size={15} strokeWidth={2.5} /> : <Copy size={15} strokeWidth={2} />}
            </button>
            <span aria-live="polite" className="sr-only">
              {copied ? "Configuration copied to clipboard" : ""}
            </span>
          </div>

          <p className="mt-4 font-mono text-[11px] leading-5 text-ink-faint">
            Replace <code>{VAULT}</code> with your vault folder. Marky can paste the whole config
            for you from Settings → AI &amp; MCP.
          </p>
        </div>
      </div>
    </section>
  );
}
