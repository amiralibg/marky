import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMarkyMcpServer } from "../src/server.js";

/**
 * The SDK turns a structuredContent/outputSchema mismatch into an error result,
 * so "no tool returned isError" is a real assertion that every declared schema
 * matches what the vault actually produces.
 */
describe("tool output schemas", () => {
  let tmpDir;
  let client;
  let server;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marky-output-test-"));
    fs.writeFileSync(
      path.join(tmpDir, "Alpha.md"),
      "---\nstatus: active\ntags:\n  - work\n---\n\n# Alpha\n\nLinks to [[Beta]] and #urgent.\n"
    );
    fs.mkdirSync(path.join(tmpDir, "Projects"));
    fs.writeFileSync(path.join(tmpDir, "Projects", "Beta.md"), "# Beta\n\nPlain note.\n");

    ({ server } = createMarkyMcpServer(tmpDir));
    const [ct, st] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "schema-test", version: "1" }, { capabilities: {} });
    await Promise.all([client.connect(ct), server.connect(st)]);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const call = async (name, args = {}) => {
    const res = await client.callTool({ name, arguments: args });
    expect(res.isError, `${name} returned an error: ${res.content?.[0]?.text}`).toBeFalsy();
    expect(res.structuredContent, `${name} returned no structuredContent`).toBeDefined();
    return res;
  };

  it("declares an output schema for every tool", async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBe(10);
    for (const tool of tools) {
      expect(tool.outputSchema, `${tool.name} has no outputSchema`).toBeDefined();
      expect(tool.outputSchema.type).toBe("object");
    }
  });

  it("returns valid structured output from every read tool", async () => {
    const search = await call("search_notes", { query: "Alpha" });
    expect(search.structuredContent.query).toBe("Alpha");
    expect(search.structuredContent.returned).toBe(search.structuredContent.results.length);

    const read = await call("read_note", { path_or_title: "Alpha" });
    expect(read.structuredContent.title).toBe("Alpha");
    expect(read.structuredContent.attributes.status).toBe("active");
    expect(read.structuredContent.outgoingLinks).toContain("Beta");
    expect(read.structuredContent.hash).toMatch(/^[0-9a-f]{16}$/);

    const list = await call("list_notes", {});
    expect(list.structuredContent.total).toBe(2);
    expect(list.structuredContent.notes.length).toBe(2);

    const structure = await call("get_vault_structure");
    expect(structure.structuredContent.root.type).toBe("folder");
    const projects = structure.structuredContent.root.children.find((c) => c.name === "Projects");
    expect(projects.children[0].name).toBe("Beta.md");

    const backlinks = await call("get_backlinks", { title: "Beta" });
    expect(backlinks.structuredContent.backlinksCount).toBe(1);
    expect(backlinks.structuredContent.backlinks[0].sourceTitle).toBe("Alpha");

    const tags = await call("get_tags");
    expect(tags.structuredContent.tags.map((t) => t.tag)).toEqual(
      expect.arrayContaining(["#work", "#urgent"])
    );
  });

  it("returns valid structured output from every write tool", async () => {
    const created = await call("create_note", {
      title: "Gamma",
      folder: "Projects",
      content: "New note.",
      tags: ["draft"],
    });
    expect(created.structuredContent).toEqual({
      success: true,
      title: "Gamma",
      relativePath: "Projects/Gamma.md",
    });

    const appended = await call("append_to_note", {
      path_or_title: "Projects/Gamma.md",
      content: "More.",
    });
    expect(appended.structuredContent.appendedLength).toBe(5);

    const updated = await call("update_note", {
      path_or_title: "Projects/Gamma.md",
      content: "Replaced.",
    });
    expect(updated.structuredContent.hash).toMatch(/^[0-9a-f]{16}$/);

    const daily = await call("create_or_append_daily_note", { content: "- logged" });
    expect(daily.structuredContent.created).toBe(true);
    expect(daily.structuredContent.relativePath).toMatch(/^\d{4}-\d{2}-\d{2}\.md$/);
  });

  it("keeps the text block in sync with the structure for read tools", async () => {
    const res = await call("list_notes", {});
    expect(JSON.parse(res.content[0].text)).toEqual(res.structuredContent);
  });

  it("returns an error without structure when a tool fails", async () => {
    const res = await client.callTool({
      name: "read_note",
      arguments: { path_or_title: "Nope" },
    });
    expect(res.isError).toBe(true);
    expect(res.structuredContent).toBeUndefined();
    expect(res.content[0].text).toMatch(/Note not found/);
  });

  it("still reports a schema-shaped result for an empty vault", async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "marky-empty-"));
    const { server: s2 } = createMarkyMcpServer(empty);
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const c2 = new Client({ name: "empty", version: "1" }, { capabilities: {} });
    await Promise.all([c2.connect(ct), s2.connect(st)]);

    for (const name of ["list_notes", "get_tags", "get_vault_structure"]) {
      const res = await c2.callTool({ name, arguments: {} });
      expect(res.isError, `${name} failed on an empty vault`).toBeFalsy();
      expect(res.structuredContent).toBeDefined();
    }

    await c2.close();
    await s2.close();
    fs.rmSync(empty, { recursive: true, force: true });
  });
});
