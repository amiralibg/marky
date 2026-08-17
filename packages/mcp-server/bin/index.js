#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { createMarkyMcpServer } from "../src/server.js";

function printUsage() {
  console.error(`
Marky Model Context Protocol (MCP) Server

Usage:
  npx @marky-app/mcp-server <path-to-vault>
  marky-mcp <path-to-vault>

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

  const rawVaultPath = args[0] || process.env.MARKY_VAULT_PATH;

  if (!rawVaultPath) {
    console.error("Error: Vault directory path is required.");
    printUsage();
    process.exit(1);
  }

  const vaultPath = path.resolve(process.cwd(), rawVaultPath);

  try {
    const { startStdio } = createMarkyMcpServer(vaultPath);
    await startStdio();
    // Stdio connection active. Note: Never log to stdout in an MCP stdio server because it corrupts JSON-RPC!
    console.error(`[marky-mcp] Server running for vault at "${vaultPath}"`);
  } catch (err) {
    console.error(`[marky-mcp] Failed to start server:`, err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[marky-mcp] Fatal error:`, err);
  process.exit(1);
});
