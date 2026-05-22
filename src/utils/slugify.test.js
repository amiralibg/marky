import { describe, expect, it } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("creates lowercase heading anchors", () => {
    expect(slugify("My Heading Title")).toBe("my-heading-title");
  });

  it("removes punctuation while preserving underscores and hyphens", () => {
    expect(slugify("API: v2_status-check!")).toBe("api-v2_status-check");
  });

  it("preserves existing repeated spacing behavior", () => {
    expect(slugify("A   B")).toBe("a-b");
  });
});
