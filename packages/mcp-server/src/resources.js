import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerResources(server, vault) {
  // 1. Static resource: vault structure
  server.resource("vault_structure", "marky://vault/structure", async (uri) => {
    const structure = vault.getVaultStructure();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(structure, null, 2),
        },
      ],
    };
  });

  // 2. Static resource: vault tags
  server.resource("vault_tags", "marky://vault/tags", async (uri) => {
    const tags = vault.getTags();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(tags, null, 2),
        },
      ],
    };
  });

  // 3. Dynamic resource template: individual notes
  server.resource(
    "note_content",
    new ResourceTemplate("marky://note/{path}", { list: undefined }),
    async (uri, { path }) => {
      try {
        const note = vault.readNote(decodeURIComponent(path));
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/markdown",
              text: note.rawContent,
            },
          ],
        };
      } catch (err) {
        throw new Error(`Failed to read note at ${path}: ${err.message}`);
      }
    }
  );
}
