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

  it("creates and appends to daily notes", () => {
    const res1 = vault.createOrAppendDailyNote("2026-08-17", "- [ ] Write MCP server");
    expect(res1.created).toBe(true);
    expect(res1.relativePath).toBe("Daily/2026-08-17.md");

    const res2 = vault.createOrAppendDailyNote("2026-08-17", "- [x] Finished MCP tests");
    expect(res2.created).toBe(false);
    expect(res2.updated).toBe(true);

    const daily = vault.readNote("Daily/2026-08-17.md");
    expect(daily.rawContent).toContain("Write MCP server");
    expect(daily.rawContent).toContain("Finished MCP tests");
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
