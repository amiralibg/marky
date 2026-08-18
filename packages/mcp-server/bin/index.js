#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { createMarkyMcpServer, VERSION } from "../src/server.js";

function printUsage() {
  console.error(`
Marky Model Context Protocol (MCP) Server v${VERSION}

Usage:
  npx @marky-app/mcp-server <path-to-vault> [options]
  marky-mcp <path-to-vault> [options]

Options:
  --read-only    Expose only the read tools; all writes are refused.
  --version, -v  Print the version and exit.
  --help, -h     Show this message.

Or set the MARKY_VAULT_PATH environment variable:
  MARKY_VAULT_PATH=/path/to/notes npx @marky-app/mcp-server

Example Claude Desktop config (~/Library/Application Support/Claude/claude_desktop_config.json):
{
  "mcpServers": {
    "marky": {
      "command": "npx",
      "args": ["-y", "@marky-app/mcp-server", "/Users/yourname/Documents/MarkyNotes"]
    }
  }
}
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.error(VERSION);
    process.exit(0);
  }

  const readOnly = args.includes("--read-only") || process.env.MARKY_READ_ONLY === "1";
  const positional = args.filter((arg) => !arg.startsWith("-"));
  const rawVaultPath = positional[0] || process.env.MARKY_VAULT_PATH;

  if (!rawVaultPath) {
    console.error("Error: Vault directory path is required.");
    printUsage();
    process.exit(1);
  }

  const vaultPath = path.resolve(process.cwd(), rawVaultPath);

  try {
    const { server, startStdio } = createMarkyMcpServer(vaultPath, { readOnly });
    await startStdio();
    // Stdio connection active. Note: Never log to stdout in an MCP stdio server because it corrupts JSON-RPC!
    console.error(
      `[marky-mcp] v${VERSION} running for vault at "${vaultPath}"${readOnly ? " (read-only)" : ""}`
    );

    let closing = false;
    const shutdown = async (signal) => {
      if (closing) return;
      closing = true;
      console.error(`[marky-mcp] ${signal} received, shutting down.`);
      try {
        await server.close();
      } catch (err) {
        console.error(`[marky-mcp] Error during shutdown:`, err.message);
      }
      process.exit(0);
    };

    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  } catch (err) {
    console.error(`[marky-mcp] Failed to start server:`, err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[marky-mcp] Fatal error:`, err);
  process.exit(1);
});
