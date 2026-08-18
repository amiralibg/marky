import { z } from "zod";

/**
 * Output schemas for every tool.
 *
 * Two rules the SDK enforces, both verified against @modelcontextprotocol/sdk
 * 1.30: a tool that declares an outputSchema MUST return `structuredContent`
 * matching it (a mismatch or omission is turned into an error), and
 * `structuredContent` must be a JSON object — so list-shaped results are
 * wrapped rather than returned as bare arrays. Explicit `isError` returns are
 * exempt from validation, which is why the error paths carry no structure.
 */

const noteRef = {
  title: z.string().describe("Note title, i.e. the filename without extension"),
  relativePath: z.string().describe("Path relative to the vault root"),
  folder: z.string().describe("Containing folder, empty string at the vault root"),
  tags: z.array(z.string()).describe("Frontmatter and inline tags, lowercased, without '#'"),
};

const backlink = z.object({
  sourceTitle: z.string(),
  sourcePath: z.string(),
});

export const searchNotesOutput = {
  query: z.string(),
  returned: z.number().int(),
  results: z.array(
    z.object({
      ...noteRef,
      // Fuse score, only present when an actual query was given. Lower is better.
      score: z.number().optional(),
      snippet: z.string(),
    })
  ),
};

export const readNoteOutput = {
  ...noteRef,
  attributes: z.record(z.unknown()).describe("Parsed frontmatter key/value pairs"),
  rawContent: z.string().describe("The complete file, frontmatter included"),
  body: z.string().describe("Content below the frontmatter"),
  outgoingLinks: z.array(z.string()).describe("[[WikiLink]] targets found in the body"),
  backlinks: z.array(backlink).describe("Notes that link to this one"),
  size: z.number().int(),
  hash: z.string().describe("Pass to update_note as expected_hash to guard the write"),
  modified: z.string(),
  created: z.string(),
};

export const createNoteOutput = {
  success: z.literal(true),
  title: z.string(),
  relativePath: z.string(),
};

export const updateNoteOutput = {
  success: z.literal(true),
  relativePath: z.string(),
  hash: z.string().describe("Digest of the content just written"),
  modified: z.string(),
};

export const appendToNoteOutput = {
  success: z.literal(true),
  relativePath: z.string(),
  appendedLength: z.number().int(),
};

export const listNotesOutput = {
  total: z.number().int().describe("Total matches before limit/offset"),
  offset: z.number().int(),
  returned: z.number().int(),
  notes: z.array(
    z.object({
      ...noteRef,
      size: z.number().int(),
      modified: z.string(),
    })
  ),
};

/**
 * The vault tree is genuinely recursive. z.lazy round-trips through the SDK's
 * JSON Schema conversion as a $ref, which was worth verifying before relying
 * on it.
 */
const treeNode = z.lazy(() =>
  z.object({
    name: z.string(),
    type: z.enum(["folder", "file"]),
    path: z.string(),
    title: z.string().optional(),
    children: z.array(treeNode).optional(),
  })
);

export const vaultStructureOutput = {
  root: treeNode,
};

export const backlinksOutput = {
  title: z.string(),
  backlinksCount: z.number().int(),
  backlinks: z.array(backlink),
};

export const tagsOutput = {
  tags: z.array(
    z.object({
      tag: z.string().describe("Tag including its leading '#'"),
      count: z.number().int(),
      notes: z.array(z.string()).describe("Relative paths of notes carrying the tag"),
    })
  ),
};

export const dailyNoteOutput = {
  created: z.boolean(),
  updated: z.boolean(),
  title: z.string(),
  relativePath: z.string(),
};
