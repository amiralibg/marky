import { z } from "zod";

export function registerTools(server, vault) {
  // 1. search_notes
  server.tool(
    "search_notes",
    "Fuzzy search across note titles, tags, and content in the Marky vault.",
    {
      query: z.string().describe("Search query keywords"),
      tag: z.string().optional().describe("Filter notes by tag (e.g. 'project' or '#project')"),
      folder: z.string().optional().describe("Filter notes within a specific folder"),
      limit: z
        .number()
        .int()
        .positive()
        .max(50)
        .default(20)
        .optional()
        .describe("Maximum number of results to return (default: 20)"),
    },
    async ({ query, tag, folder, limit }) => {
      try {
        const results = vault.searchNotes(query, { tag, folder, limit });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error searching notes: ${err.message}` }],
        };
      }
    }
  );

  // 2. read_note
  server.tool(
    "read_note",
    "Read the full content, frontmatter properties, tags, outgoing links, and backlinks of a note.",
    {
      path_or_title: z
        .string()
        .describe("The relative path (e.g. 'Projects/Roadmap.md') or note title (e.g. 'Roadmap')"),
    },
    async ({ path_or_title }) => {
      try {
        const note = vault.readNote(path_or_title);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(note, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error reading note: ${err.message}` }],
        };
      }
    }
  );

  // 3. create_note
  server.tool(
    "create_note",
    "Create a new markdown note in the Marky vault with optional frontmatter attributes and tags.",
    {
      title: z.string().describe("Title of the new note (e.g. 'Architecture Decision 001')"),
      folder: z
        .string()
        .optional()
        .default("")
        .describe("Target folder inside the vault (e.g. 'Work/Decisions'). Defaults to vault root"),
      content: z.string().optional().default("").describe("Initial markdown content of the note"),
      tags: z
        .array(z.string())
        .optional()
        .describe("List of tags to assign in frontmatter (e.g. ['architecture', 'rfc'])"),
    },
    async ({ title, folder, content, tags }) => {
      try {
        const result = vault.createNote({ title, folder, content, tags });
        return {
          content: [
            {
              type: "text",
              text: `Note created successfully at "${result.relativePath}"`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error creating note: ${err.message}` }],
        };
      }
    }
  );

  // 4. update_note
  server.tool(
    "update_note",
    "Replace the entire content of an existing note.",
    {
      path_or_title: z.string().describe("The relative path or note title of the note to update"),
      content: z.string().describe("The complete replacement markdown content"),
    },
    async ({ path_or_title, content }) => {
      try {
        const result = vault.updateNote({ relativePath: path_or_title, content });
        return {
          content: [
            {
              type: "text",
              text: `Note "${result.relativePath}" updated successfully at ${result.modified}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error updating note: ${err.message}` }],
        };
      }
    }
  );

  // 5. append_to_note
  server.tool(
    "append_to_note",
    "Append markdown text or sections to the end of an existing note.",
    {
      path_or_title: z.string().describe("The relative path or note title of the note"),
      content: z.string().describe("The markdown content to append"),
    },
    async ({ path_or_title, content }) => {
      try {
        const result = vault.appendToNote({ relativePath: path_or_title, content });
        return {
          content: [
            {
              type: "text",
              text: `Successfully appended content to "${result.relativePath}"`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error appending to note: ${err.message}` }],
        };
      }
    }
  );

  // 6. list_notes
  server.tool(
    "list_notes",
    "List notes in the vault with metadata, optional folder filtering, and tag filtering.",
    {
      folder: z.string().optional().describe("Optional folder path to list notes from"),
      tag: z.string().optional().describe("Optional tag to filter by"),
    },
    async ({ folder, tag }) => {
      try {
        const list = vault.listNotes({ folder, tag });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(list, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing notes: ${err.message}` }],
        };
      }
    }
  );

  // 7. get_vault_structure
  server.tool(
    "get_vault_structure",
    "Get the complete folder and file tree hierarchy of the Marky workspace.",
    {},
    async () => {
      try {
        const structure = vault.getVaultStructure();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(structure, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error getting vault structure: ${err.message}` }],
        };
      }
    }
  );

  // 8. get_backlinks
  server.tool(
    "get_backlinks",
    "Find all notes that link to a specific note title using [[WikiLinks]].",
    {
      title: z.string().describe("The note title to inspect backlinks for"),
    },
    async ({ title }) => {
      try {
        const backlinks = vault.getBacklinks(title);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(backlinks, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error getting backlinks: ${err.message}` }],
        };
      }
    }
  );

  // 9. get_tags
  server.tool(
    "get_tags",
    "List all hashtags and frontmatter tags used across the vault along with note counts.",
    {},
    async () => {
      try {
        const tags = vault.getTags();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(tags, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error getting tags: ${err.message}` }],
        };
      }
    }
  );

  // 10. create_or_append_daily_note
  server.tool(
    "create_or_append_daily_note",
    "Create or append entries to a Daily Note (in Daily/YYYY-MM-DD.md format).",
    {
      date: z.string().optional().describe("Date in YYYY-MM-DD format (defaults to current date)"),
      content: z.string().optional().describe("Content or log entry to add to the daily note"),
    },
    async ({ date, content }) => {
      try {
        const result = vault.createOrAppendDailyNote(date, content);
        return {
          content: [
            {
              type: "text",
              text: result.created
                ? `Created new daily note at "${result.relativePath}"`
                : `Appended entry to daily note at "${result.relativePath}"`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error in daily note: ${err.message}` }],
        };
      }
    }
  );
}
