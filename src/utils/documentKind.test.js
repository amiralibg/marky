import { describe, expect, it } from "vitest";
import {
  documentKindFromPath,
  documentKindOf,
  extensionForKind,
  isDocumentPath,
  isHtmlDocument,
  isHtmlPath,
  stripDocumentExtension,
} from "./documentKind";

describe("documentKind", () => {
  it("derives the kind from the extension, in any case", () => {
    expect(documentKindFromPath("/v/Report.html")).toBe("html");
    expect(documentKindFromPath("/v/Report.HTM")).toBe("html");
    expect(documentKindFromPath("C:\\v\\page.Html")).toBe("html");
    expect(documentKindFromPath("/v/Note.md")).toBe("markdown");
    expect(documentKindFromPath("/v/page.xhtml")).toBe("markdown");
    expect(documentKindFromPath("/v/.html")).toBe("markdown");
    expect(documentKindFromPath("")).toBe("markdown");
    expect(documentKindFromPath(null)).toBe("markdown");
  });

  it("answers path questions", () => {
    expect(isHtmlPath("a/b.htm")).toBe(true);
    expect(isHtmlPath("a/b.md")).toBe(false);
    expect(isDocumentPath("a/b.md")).toBe(true);
    expect(isDocumentPath("a/b.html")).toBe(true);
    expect(isDocumentPath("a/b.png")).toBe(false);
  });

  it("reads the kind of an item, falling back to its path", () => {
    expect(documentKindOf({ kind: "html" })).toBe("html");
    expect(documentKindOf({ filePath: "/v/x.html" })).toBe("html");
    expect(documentKindOf({ path: "/v/x.md" })).toBe("markdown");
    expect(documentKindOf({ kind: "bogus", filePath: "/v/x.htm" })).toBe("html");
    expect(documentKindOf(null)).toBe("markdown");
    expect(isHtmlDocument({ filePath: "/v/x.html" })).toBe(true);
    expect(isHtmlDocument({ name: "x" })).toBe(false);
  });

  it("drops the extension from display names", () => {
    expect(stripDocumentExtension("Q3 report.html")).toBe("Q3 report");
    expect(stripDocumentExtension("Q3 report.HTM")).toBe("Q3 report");
    expect(stripDocumentExtension("Weekly review.md")).toBe("Weekly review");
    expect(stripDocumentExtension("v1.2 notes")).toBe("v1.2 notes");
    expect(stripDocumentExtension(".html")).toBe(".html");
    expect(stripDocumentExtension("")).toBe("");
  });

  it("names the extension for a new file", () => {
    expect(extensionForKind("html")).toBe(".html");
    expect(extensionForKind("markdown")).toBe(".md");
    expect(extensionForKind(undefined)).toBe(".md");
  });
});
