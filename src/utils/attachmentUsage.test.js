import { beforeEach, describe, expect, it } from "vitest";
import { getIndexedAttachments, setAttachmentIndex } from "./attachments";
import { buildAttachmentUsageMap, collectLinkTargets } from "./attachmentUsage";

describe("collectLinkTargets", () => {
  it("collects markdown images, links and wiki embeds", () => {
    const content = [
      "![alt](attachments/a.png)",
      "[doc](./notes/b.md)",
      "![[c.png|300]]",
      "text",
    ].join("\n");
    expect(collectLinkTargets(content)).toEqual(["attachments/a.png", "./notes/b.md", "c.png|300"]);
  });

  it("skips web URLs and plain wiki links to notes", () => {
    const content = [
      "![web](https://example.com/x.png)",
      "<!-- data -->![](data:image/png;base64,AAA)",
      "[[Some Note]]",
      "![[chart.png]]",
    ].join("\n");
    expect(collectLinkTargets(content)).toEqual(["chart.png"]);
  });

  it("returns nothing without content", () => {
    expect(collectLinkTargets("")).toEqual([]);
    expect(collectLinkTargets(null)).toEqual([]);
  });
});

describe("buildAttachmentUsageMap", () => {
  const vaultRoot = "/vault";

  beforeEach(() => {
    setAttachmentIndex(
      [{ path: "/vault/attachments/a.png" }, { path: "/vault/deep/other/c.png" }],
      vaultRoot
    );
  });

  const note = (id, content) => ({
    id,
    name: id,
    filePath: `${vaultRoot}/Notes/${id}.md`,
    content,
  });

  it("groups different reference styles onto the same file", () => {
    const usage = buildAttachmentUsageMap(
      [note("one", "![[a.png]]"), note("two", "![x](../attachments/a.png)")],
      { vaultRoot, knownPaths: new Set(getIndexedAttachments().map((p) => p.toLowerCase())) }
    );
    expect(usage.get("/vault/attachments/a.png")).toEqual([
      { id: "one", name: "one" },
      { id: "two", name: "two" },
    ]);
  });

  it("resolves bare names through the vault index", () => {
    const usage = buildAttachmentUsageMap([note("three", "![[c.png]]")], {
      vaultRoot,
      knownPaths: new Set(getIndexedAttachments().map((p) => p.toLowerCase())),
    });
    expect(usage.get("/vault/deep/other/c.png")).toEqual([{ id: "three", name: "three" }]);
  });

  it("ignores references that resolve nowhere on disk", () => {
    const usage = buildAttachmentUsageMap([note("four", "![x](missing.png)")], {
      vaultRoot,
      knownPaths: new Set(getIndexedAttachments().map((p) => p.toLowerCase())),
    });
    expect(usage.size).toBe(0);
  });

  it("handles an empty workspace", () => {
    expect(buildAttachmentUsageMap([], { vaultRoot }).size).toBe(0);
    expect(buildAttachmentUsageMap(null, { vaultRoot }).size).toBe(0);
  });
});
