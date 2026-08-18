import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Vault } from "./vault.js";
import { registerTools } from "./tools.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

// Single source of truth for the version the server advertises.
const { version } = createRequire(import.meta.url)("../package.json");

export const VERSION = version;

export function createMarkyMcpServer(vaultPath, options = {}) {
  const vault = new Vault(vaultPath, options);

  const server = new McpServer(
    { name: "marky-mcp-server", version },
    {
      instructions:
        "Read and write notes in a local Marky markdown vault. Notes are plain files; " +
        "[[WikiLinks]] connect them and #hashtags or frontmatter `tags` classify them. " +
        "Prefer search_notes or list_notes to locate a note before reading it, and pass the " +
        "`hash` from read_note to update_note as `expected_hash` when rewriting a whole note.",
    }
  );

  registerTools(server, vault);
  registerResources(server, vault);
  registerPrompts(server, vault);

  return {
    server,
    vault,
    async startStdio() {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      return transport;
    },
  };
}
