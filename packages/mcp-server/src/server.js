import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Vault } from "./vault.js";
import { registerTools } from "./tools.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

export function createMarkyMcpServer(vaultPath, options = {}) {
  const vault = new Vault(vaultPath, options);

  const server = new McpServer({
    name: "marky-mcp-server",
    version: "1.0.0",
  });

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
