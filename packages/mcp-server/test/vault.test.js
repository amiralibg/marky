import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Vault } from "../src/vault.js";

describe("Vault Engine", () => {
  let tmpDir;
  let vault;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marky-vault-test-"));
    vault = new Vault(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("vault containment", () => {
    it("refuses a folder that escapes the vault", () => {
      expect(() =>
        vault.createNote({ title: "pwned", folder: "../../escaped", content: "x" })
      ).toThrow(/escapes the vault/);
      expect(fs.existsSync(path.join(tmpDir, "..", "..", "escaped"))).toBe(false);
    });

    it("refuses a folder that escapes via a deeper path", () => {
      expect(() =>
        vault.createNote({ title: "pwned", folder: "Notes/../../escaped", content: "x" })
      ).toThrow(/escapes the vault/);
    });

    it("treats an absolute folder as vault-relative", () => {
      const result = vault.createNote({ title: "abs", folder: "/etc/cron.d", content: "x" });
      expect(result.relativePath).toBe("etc/cron.d/abs.md");
      expect(result.fullPath.startsWith(tmpDir)).toBe(true);
    });

    it("strips traversal segments out of a title", () => {
      const result = vault.createNote({ title: "../../up", content: "x" });
      expect(result.relativePath).toBe("up.md");
    });

    it("rejects a title with no usable characters", () => {
      expect(() => vault.createNote({ title: "///", content: "x" })).toThrow(
        /no usable characters/
      );
    });
  });

  describe("read-only mode", () => {
    it("refuses every write but still serves reads", () => {
      vault.createNote({ title: "Existing", content: "hello #tag" });

      const ro = new Vault(tmpDir, { readOnly: true });
      expect(ro.readNote("Existing").body).toContain("hello");
      expect(() => ro.createNote({ title: "Nope", content: "x" })).toThrow(/read-only/);
      expect(() => ro.updateNote({ relativePath: "Existing", content: "x" })).toThrow(/read-only/);
      expect(() => ro.appendToNote({ relativePath: "Existing", content: "x" })).toThrow(
        /read-only/
      );
      expect(() => ro.createOrAppendDailyNote(null, "x")).toThrow(/read-only/);
    });
  });

  describe("result limits", () => {
    beforeEach(() => {
      for (let i = 0; i < 40; i += 1) {
        vault.createNote({ title: `Note ${String(i).padStart(2, "0")}`, content: "lorem shared" });
      }
    });

    it("defaults searchNotes to 20 results when no limit is given", () => {
      expect(vault.searchNotes("lorem").length).toBe(20);
      expect(vault.searchNotes("lorem", { limit: 5 }).length).toBe(5);
      expect(vault.searchNotes("lorem", { limit: 500 }).length).toBe(40);
    });

    it("paginates listNotes and reports the total", () => {
      const page = vault.listNotes({ limit: 10, offset: 30 });
      expect(page.total).toBe(40);
      expect(page.returned).toBe(10);
      expect(page.offset).toBe(30);
      expect(page.notes.length).toBe(10);
    });
  });

  describe("update concurrency", () => {
    it("refuses a write when the note changed since it was read", () => {
      vault.createNote({ title: "Racy", content: "original" });
      const { hash } = vault.readNote("Racy");

      vault.updateNote({ relativePath: "Racy", content: "changed by the app" });

      expect(() =>
        vault.updateNote({ relativePath: "Racy", content: "stale overwrite", expectedHash: hash })
      ).toThrow(/changed since it was read/);
      expect(vault.readNote("Racy").rawContent).toBe("changed by the app");
    });

    it("allows the write when the hash still matches", () => {
      vault.createNote({ title: "Calm", content: "original" });
      const { hash } = vault.readNote("Calm");
      const result = vault.updateNote({
        relativePath: "Calm",
        content: "updated",
        expectedHash: hash,
      });
      expect(result.success).toBe(true);
      expect(vault.readNote("Calm").rawContent).toBe("updated");
    });
  });

  it("does not resolve a path suffix across a name boundary", () => {
    vault.createNote({ title: "MyNote", content: "wrong one" });
    expect(() => vault.readNote("Note.md")).toThrow(/Note not found/);
  });

  it("creates a note with frontmatter and tags", () => {
    const result = vault.createNote({
      title: "Getting Started",
      folder: "Guides",
      content: "Welcome to Marky! Check out [[Features]] and #productivity.",
      tags: ["intro", "guide"],
      attributes: { author: "Amirali" },
    });

    expect(result.success).toBe(true);
    expect(result.relativePath).toBe("Guides/Getting Started.md");

    const note = vault.readNote("Getting Started");
    expect(note.title).toBe("Getting Started");
    expect(note.attributes.author).toBe("Amirali");
    expect(note.tags).toContain("intro");
    expect(note.tags).toContain("guide");
    expect(note.tags).toContain("productivity");
    expect(note.outgoingLinks).toContain("Features");
  });

  it("indexes backlinks correctly across multiple notes", () => {
    vault.createNote({
      title: "Index",
      content: "Links to [[Topic A]] and [[Topic B]].",
    });

    vault.createNote({
      title: "Topic A",
      content: "References [[Topic B]].",
    });

    vault.createNote({
      title: "Topic B",
      content: "End of chain.",
    });

    const backlinksB = vault.getBacklinks("Topic B");
    expect(backlinksB.backlinksCount).toBe(2);
    const sources = backlinksB.backlinks.map((b) => b.sourceTitle);
    expect(sources).toContain("Index");
    expect(sources).toContain("Topic A");
  });

  it("updates and appends to existing notes", () => {
    vault.createNote({
      title: "Changelog",
      content: "## v1.0.0\nInitial release.",
    });

    vault.appendToNote({
      relativePath: "Changelog.md",
      content: "## v1.1.0\nMCP support added.",
    });

    const updated = vault.readNote("Changelog");
    expect(updated.rawContent).toContain("## v1.0.0");
    expect(updated.rawContent).toContain("## v1.1.0");
    expect(updated.rawContent).toContain("MCP support added.");
  });

  it("searches notes using fuzzy search and tag filters", () => {
    vault.createNote({
      title: "Rust Guide",
      content: "Memory safety without garbage collection.",
      tags: ["programming", "rust"],
    });

    vault.createNote({
      title: "TypeScript Overview",
      content: "JavaScript with syntax for types.",
      tags: ["programming", "typescript"],
    });

    vault.createNote({
      title: "Cooking Recipe",
      content: "How to make sourdough bread.",
      tags: ["food"],
    });

    const searchResults = vault.searchNotes("memory safety");
    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0].title).toBe("Rust Guide");

    const tagFiltered = vault.searchNotes("", { tag: "programming" });
    expect(tagFiltered.length).toBe(2);
  });

  it("creates and appends to daily notes at the vault root, matching the app", () => {
    const res1 = vault.createOrAppendDailyNote("2026-08-17", "- [ ] Write MCP server");
    expect(res1.created).toBe(true);
    expect(res1.relativePath).toBe("2026-08-17.md");

    const res2 = vault.createOrAppendDailyNote("2026-08-17", "- [x] Finished MCP tests");
    expect(res2.created).toBe(false);
    expect(res2.updated).toBe(true);

    const daily = vault.readNote("2026-08-17.md");
    expect(daily.rawContent).toContain("Write MCP server");
    expect(daily.rawContent).toContain("Finished MCP tests");
  });

  it("appends to a legacy Daily/ note instead of creating a duplicate at the root", () => {
    vault.createNote({ title: "2026-08-16", folder: "Daily", content: "# 2026-08-16\n\nlegacy\n" });

    const res = vault.createOrAppendDailyNote("2026-08-16", "- appended by MCP");
    expect(res.created).toBe(false);
    expect(res.relativePath).toBe("Daily/2026-08-16.md");

    expect(fs.existsSync(path.join(tmpDir, "2026-08-16.md"))).toBe(false);
    expect(vault.readNote("Daily/2026-08-16.md").rawContent).toContain("appended by MCP");
  });

  it("rejects an invalid date rather than writing a garbage filename", () => {
    expect(() => vault.createOrAppendDailyNote("not-a-date", "x")).toThrow(/Invalid date/);
  });

  it("finds daily notes in both the root and the legacy folder", () => {
    vault.createOrAppendDailyNote("2026-08-17", "root note");
    vault.createNote({ title: "2026-08-15", folder: "Daily", content: "# 2026-08-15\n\nlegacy\n" });

    const daily = vault.listDailyNotes();
    expect(daily.map((n) => n.relativePath)).toEqual(["2026-08-17.md", "Daily/2026-08-15.md"]);
  });

  it("returns hierarchical vault structure", () => {
    vault.createNote({ title: "Root Note", content: "Root" });
    vault.createNote({ title: "Child Note", folder: "Folder1/Subfolder", content: "Child" });

    const tree = vault.getVaultStructure();
    expect(tree.type).toBe("folder");
    expect(tree.children.length).toBeGreaterThan(0);
    const folder1 = tree.children.find((c) => c.name === "Folder1");
    expect(folder1).toBeDefined();
    expect(folder1.type).toBe("folder");
  });
});
