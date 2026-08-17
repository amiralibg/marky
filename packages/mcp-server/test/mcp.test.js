import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Vault } from "../src/vault.js";
import { registerTools } from "../src/tools.js";
import { registerResources } from "../src/resources.js";
import { registerPrompts } from "../src/prompts.js";

describe("Marky MCP Protocol Integration", () => {
  let tmpDir;
  let vault;
  let server;
  let client;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marky-mcp-test-"));
    vault = new Vault(tmpDir);

    server = new McpServer({
      name: "test-marky-server",
      version: "1.0.0",
    });

    registerTools(server, vault);
    registerResources(server, vault);
    registerPrompts(server, vault);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: { tools: {}, resources: {}, prompts: {} } }
    );

    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("lists all registered tools", async () => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);

    expect(toolNames).toContain("search_notes");
    expect(toolNames).toContain("read_note");
    expect(toolNames).toContain("create_note");
    expect(toolNames).toContain("update_note");
    expect(toolNames).toContain("append_to_note");
    expect(toolNames).toContain("list_notes");
    expect(toolNames).toContain("get_vault_structure");
    expect(toolNames).toContain("get_backlinks");
    expect(toolNames).toContain("get_tags");
    expect(toolNames).toContain("create_or_append_daily_note");
  });

  it("executes create_note and read_note tools", async () => {
    const createRes = await client.callTool({
      name: "create_note",
      arguments: {
        title: "Integration Test Note",
        folder: "Testing",
        content: "Testing MCP tools with #automation and [[OtherNote]].",
        tags: ["vitest"],
      },
    });

    expect(createRes.isError).toBeFalsy();
    expect(createRes.content[0].text).toContain("Note created successfully");

    const readRes = await client.callTool({
      name: "read_note",
      arguments: {
        path_or_title: "Integration Test Note",
      },
    });

    expect(readRes.isError).toBeFalsy();
    const noteData = JSON.parse(readRes.content[0].text);
    expect(noteData.title).toBe("Integration Test Note");
    expect(noteData.tags).toContain("automation");
    expect(noteData.tags).toContain("vitest");
    expect(noteData.outgoingLinks).toContain("OtherNote");
  });

  it("lists prompts", async () => {
    const prompts = await client.listPrompts();
    const promptNames = prompts.prompts.map((p) => p.name);
    expect(promptNames).toContain("summarize_note");
    expect(promptNames).toContain("daily_review");
    expect(promptNames).toContain("find_connections");
  });

  it("lists and reads resources", async () => {
    vault.createNote({ title: "Resource Note", content: "Resource content #sample" });

    const resources = await client.listResources();
    expect(resources.resources.length).toBeGreaterThan(0);

    const structureRes = await client.readResource({ uri: "marky://vault/structure" });
    expect(structureRes.contents[0].text).toContain("Resource Note");
  });
});
