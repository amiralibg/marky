import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerResources(server, vault) {
  // 1. Static resource: vault structure
  server.registerResource(
    "vault_structure",
    "marky://vault/structure",
    {
      title: "Vault structure",
      description: "The complete folder and note tree of the Marky vault, as JSON.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(vault.getVaultStructure(), null, 2),
        },
      ],
    })
  );

  // 2. Static resource: vault tags
  server.registerResource(
    "vault_tags",
    "marky://vault/tags",
    {
      title: "Vault tags",
      description: "Every hashtag and frontmatter tag in the vault with note counts, as JSON.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(vault.getTags(), null, 2),
        },
      ],
    })
  );

  // 3. Dynamic resource template: individual notes.
  // The list callback makes notes discoverable instead of guessable, and
  // complete() lets clients autocomplete the {path} argument.
  server.registerResource(
    "note_content",
    new ResourceTemplate("marky://note/{path}", {
      list: async () => {
        const { notes } = vault.listNotes({ limit: 500 });
        return {
          resources: notes.map((note) => ({
            uri: `marky://note/${encodeURIComponent(note.relativePath)}`,
            name: note.title,
            description: note.folder ? `Note in ${note.folder}` : "Note in the vault root",
            mimeType: "text/markdown",
          })),
        };
      },
      complete: {
        path: async (value) => {
          const { notes } = vault.listNotes({ limit: 200 });
          const needle = String(value || "").toLowerCase();
          return notes
            .map((note) => note.relativePath)
            .filter((relativePath) => relativePath.toLowerCase().includes(needle))
            .slice(0, 100);
        },
      },
    }),
    {
      title: "Note content",
      description: "The raw markdown of a single note, addressed by its vault-relative path.",
      mimeType: "text/markdown",
    },
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
