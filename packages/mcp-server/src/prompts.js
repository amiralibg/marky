import { z } from "zod";

export function registerPrompts(server, vault) {
  // 1. summarize_note
  server.prompt(
    "summarize_note",
    "Generate an executive summary, key takeaways, and action items for a note in your vault.",
    {
      note_path_or_title: z.string().describe("Relative path or title of the note"),
    },
    async ({ note_path_or_title }) => {
      const note = vault.readNote(note_path_or_title);
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please provide a structured summary of the following note from my Marky vault:

# Note Title: ${note.title}
Path: ${note.relativePath}
Tags: ${note.tags.map((t) => `#${t}`).join(" ") || "none"}
Backlinks: ${note.backlinks.map((b) => `[[${b.sourceTitle}]]`).join(", ") || "none"}

---
${note.rawContent}
---

Structure your response with:
1. **Executive Summary** (1-2 sentences)
2. **Key Points / Highlights** (bullet points)
3. **Action Items / Tasks** (if any)
4. **Suggested Related Topics / Connections**`,
            },
          },
        ],
      };
    }
  );

  // 2. daily_review
  server.prompt(
    "daily_review",
    "Review recent daily notes and synthesize accomplishments, blockers, and next priorities.",
    {
      days_back: z
        .string()
        .optional()
        .describe("Number of recent daily notes to inspect (default: 5)"),
    },
    async ({ days_back }) => {
      const count = parseInt(days_back || "5", 10) || 5;
      const dailyNotes = vault
        .listNotes({ folder: "Daily" })
        .sort((a, b) => b.title.localeCompare(a.title))
        .slice(0, count);

      const contents = dailyNotes.map((n) => {
        const full = vault.readNote(n.relativePath);
        return `### ${n.title} (${n.relativePath})\n${full.body}\n`;
      });

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Here are my recent daily notes from my Marky vault:

${contents.join("\n---\n\n") || "No daily notes found in the Daily folder."}

Please synthesize:
1. **Accomplishments & Progress Summary**
2. **Unfinished Tasks & Pending Action Items**
3. **Recurring Blockers or Themes**
4. **Recommended Focus for Today**`,
            },
          },
        ],
      };
    }
  );

  // 3. find_connections
  server.prompt(
    "find_connections",
    "Analyze a note and suggest new [[WikiLinks]] and tags based on the rest of the vault.",
    {
      note_path_or_title: z.string().describe("Relative path or title of the note to analyze"),
    },
    async ({ note_path_or_title }) => {
      const target = vault.readNote(note_path_or_title);
      const allNotes = vault.listNotes();
      const allTags = vault.getTags();

      const noteTitles = allNotes.map((n) => n.title).filter((t) => t !== target.title);

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `I want to connect this note to the rest of my Marky vault knowledge graph.

Target Note:
Title: ${target.title}
Tags: ${target.tags.map((t) => `#${t}`).join(" ") || "none"}
Current Outgoing Links: ${target.outgoingLinks.map((l) => `[[${l}]]`).join(", ") || "none"}

Content:
${target.body}

---
Other Notes Available in Vault:
${noteTitles.slice(0, 100).join(", ")}

Available Vault Tags:
${allTags.map((t) => t.tag).join(", ")}

Please analyze the note and suggest:
1. Where in the text I should add \`[[WikiLinks]]\` to existing notes from the list.
2. Suggested new tags from existing vault tags or new relevant hashtags.
3. Potential new notes I should create to expand on ideas mentioned here.`,
            },
          },
        ],
      };
    }
  );
}
