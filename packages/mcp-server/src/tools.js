import { z } from "zod";
import * as out from "./schemas.js";

/**
 * A successful result. `structuredContent` is what a client parses;
 * `content` is what it shows. Read tools serialise the same object into text
 * so the two never disagree; write tools pass a human sentence instead.
 */
const ok = (structured, text) => ({
  content: [{ type: "text", text: text ?? JSON.stringify(structured, null, 2) }],
  structuredContent: structured,
});

/** Error results carry no structure — the SDK exempts them from validation. */
const failure = (label, err) => ({
  isError: true,
  content: [{ type: "text", text: `${label}: ${err.message}` }],
});

/** Reads never mutate the vault and never reach outside it. */
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

/** Writes that only ever add content. */
const ADDITIVE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export function registerTools(server, vault) {
  // 1. search_notes
  server.registerTool(
    "search_notes",
    {
      title: "Search notes",
      description: "Fuzzy search across note titles, tags, and content in the Marky vault.",
      inputSchema: {
        query: z.string().describe("Search query keywords"),
        tag: z.string().optional().describe("Filter notes by tag (e.g. 'project' or '#project')"),
        folder: z.string().optional().describe("Filter notes within a specific folder"),
        limit: z
          .number()
          .int()
          .positive()
          .max(50)
          .optional()
          .default(20)
          .describe("Maximum number of results to return (default: 20, max: 50)"),
      },
      outputSchema: out.searchNotesOutput,
      annotations: READ_ONLY,
    },
    async ({ query, tag, folder, limit }) => {
      try {
        const results = vault.searchNotes(query, { tag, folder, limit });
        return ok({ query, returned: results.length, results });
      } catch (err) {
        return failure("Error searching notes", err);
      }
    }
  );

  // 2. read_note
  server.registerTool(
    "read_note",
    {
      title: "Read note",
      description:
        "Read the full content, frontmatter properties, tags, outgoing links, and backlinks of a note. " +
        "The returned `hash` can be passed to update_note as `expected_hash` to make a later write conditional.",
      inputSchema: {
        path_or_title: z
          .string()
          .describe(
            "The relative path (e.g. 'Projects/Roadmap.md') or note title (e.g. 'Roadmap')"
          ),
      },
      outputSchema: out.readNoteOutput,
      annotations: READ_ONLY,
    },
    async ({ path_or_title }) => {
      try {
        return ok(vault.readNote(path_or_title));
      } catch (err) {
        return failure("Error reading note", err);
      }
    }
  );

  // 3. create_note
  server.registerTool(
    "create_note",
    {
      title: "Create note",
      description:
        "Create a new markdown note in the Marky vault with optional frontmatter attributes and tags. " +
        "Fails if a note already exists at that path.",
      inputSchema: {
        title: z.string().describe("Title of the new note (e.g. 'Architecture Decision 001')"),
        folder: z
          .string()
          .optional()
          .default("")
          .describe(
            "Target folder inside the vault (e.g. 'Work/Decisions'). Must stay within the vault. Defaults to vault root"
          ),
        content: z.string().optional().default("").describe("Initial markdown content of the note"),
        tags: z
          .array(z.string())
          .optional()
          .describe("List of tags to assign in frontmatter (e.g. ['architecture', 'rfc'])"),
      },
      outputSchema: out.createNoteOutput,
      annotations: ADDITIVE,
    },
    async ({ title, folder, content, tags }) => {
      try {
        const result = vault.createNote({ title, folder, content, tags });
        // fullPath is deliberately not surfaced; it is an absolute machine path.
        return ok(
          { success: true, title: result.title, relativePath: result.relativePath },
          `Note created successfully at "${result.relativePath}"`
        );
      } catch (err) {
        return failure("Error creating note", err);
      }
    }
  );

  // 4. update_note
  server.registerTool(
    "update_note",
    {
      title: "Update note",
      description:
        "Replace the entire content of an existing note. This overwrites the file, so pass " +
        "`expected_hash` from a recent read_note to abort if the note changed in the meantime.",
      inputSchema: {
        path_or_title: z.string().describe("The relative path or note title of the note to update"),
        content: z.string().describe("The complete replacement markdown content"),
        expected_hash: z
          .string()
          .optional()
          .describe(
            "The `hash` from a previous read_note. If given and the note has changed since, the write is refused."
          ),
      },
      outputSchema: out.updateNoteOutput,
      annotations: {
        readOnlyHint: false,
        // Replaces the whole file; a wrong call loses the previous contents.
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ path_or_title, content, expected_hash }) => {
      try {
        const result = vault.updateNote({
          relativePath: path_or_title,
          content,
          expectedHash: expected_hash,
        });
        return ok(
          result,
          `Note "${result.relativePath}" updated successfully at ${result.modified} (hash ${result.hash})`
        );
      } catch (err) {
        return failure("Error updating note", err);
      }
    }
  );

  // 5. append_to_note
  server.registerTool(
    "append_to_note",
    {
      title: "Append to note",
      description: "Append markdown text or sections to the end of an existing note.",
      inputSchema: {
        path_or_title: z.string().describe("The relative path or note title of the note"),
        content: z.string().describe("The markdown content to append"),
      },
      outputSchema: out.appendToNoteOutput,
      annotations: ADDITIVE,
    },
    async ({ path_or_title, content }) => {
      try {
        const result = vault.appendToNote({ relativePath: path_or_title, content });
        return ok(result, `Successfully appended content to "${result.relativePath}"`);
      } catch (err) {
        return failure("Error appending to note", err);
      }
    }
  );

  // 6. list_notes
  server.registerTool(
    "list_notes",
    {
      title: "List notes",
      description:
        "List notes in the vault with metadata, optional folder filtering, and tag filtering. " +
        "Results are paginated; the response reports `total` so you can page with `offset`.",
      inputSchema: {
        folder: z.string().optional().describe("Optional folder path to list notes from"),
        tag: z.string().optional().describe("Optional tag to filter by"),
        limit: z
          .number()
          .int()
          .positive()
          .max(200)
          .optional()
          .default(50)
          .describe("Maximum number of notes to return (default: 50, max: 200)"),
        offset: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .default(0)
          .describe("Number of notes to skip, for paging through a large vault"),
      },
      outputSchema: out.listNotesOutput,
      annotations: READ_ONLY,
    },
    async ({ folder, tag, limit, offset }) => {
      try {
        return ok(vault.listNotes({ folder, tag, limit, offset }));
      } catch (err) {
        return failure("Error listing notes", err);
      }
    }
  );

  // 7. get_vault_structure
  server.registerTool(
    "get_vault_structure",
    {
      title: "Get vault structure",
      description: "Get the complete folder and file tree hierarchy of the Marky workspace.",
      inputSchema: {},
      outputSchema: out.vaultStructureOutput,
      annotations: READ_ONLY,
    },
    async () => {
      try {
        return ok({ root: vault.getVaultStructure() });
      } catch (err) {
        return failure("Error getting vault structure", err);
      }
    }
  );

  // 8. get_backlinks
  server.registerTool(
    "get_backlinks",
    {
      title: "Get backlinks",
      description: "Find all notes that link to a specific note title using [[WikiLinks]].",
      inputSchema: {
        title: z.string().describe("The note title to inspect backlinks for"),
      },
      outputSchema: out.backlinksOutput,
      annotations: READ_ONLY,
    },
    async ({ title }) => {
      try {
        return ok(vault.getBacklinks(title));
      } catch (err) {
        return failure("Error getting backlinks", err);
      }
    }
  );

  // 9. get_tags
  server.registerTool(
    "get_tags",
    {
      title: "Get tags",
      description: "List all hashtags and frontmatter tags used across the vault with note counts.",
      inputSchema: {},
      outputSchema: out.tagsOutput,
      annotations: READ_ONLY,
    },
    async () => {
      try {
        return ok({ tags: vault.getTags() });
      } catch (err) {
        return failure("Error getting tags", err);
      }
    }
  );

  // 10. create_or_append_daily_note
  server.registerTool(
    "create_or_append_daily_note",
    {
      title: "Create or append daily note",
      description:
        "Create or append entries to the daily note for a date. Daily notes live at the vault " +
        "root as YYYY-MM-DD.md, the same location and filename the Marky app uses, so the app " +
        "and this server share one note per day.",
      inputSchema: {
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
          .optional()
          .describe("Date in YYYY-MM-DD format (defaults to today, in local time)"),
        content: z.string().optional().describe("Content or log entry to add to the daily note"),
      },
      outputSchema: out.dailyNoteOutput,
      annotations: ADDITIVE,
    },
    async ({ date, content }) => {
      try {
        const result = vault.createOrAppendDailyNote(date, content);
        return ok(
          result,
          result.created
            ? `Created new daily note at "${result.relativePath}"`
            : result.updated
              ? `Appended entry to daily note at "${result.relativePath}"`
              : `Daily note already exists at "${result.relativePath}" (nothing to append)`
        );
      } catch (err) {
        return failure("Error in daily note", err);
      }
    }
  );
}
