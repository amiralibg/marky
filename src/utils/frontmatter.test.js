import { describe, expect, it } from "vitest";
import {
  getNoteProperties,
  mergeNoteProperties,
  parseFrontmatter,
  writeFrontmatter,
} from "./frontmatter";

describe("frontmatter utilities", () => {
  it("parses scalar values and YAML lists", () => {
    const content = [
      "---",
      "aliases:",
      "  - Draft",
      "  - Working title",
      "status: active",
      "type: project",
      "tags: [writing, idea]",
      "---",
      "# Body",
    ].join("\n");

    expect(getNoteProperties(content)).toMatchObject({
      aliases: ["Draft", "Working title"],
      status: "active",
      type: "project",
      tags: ["writing", "idea"],
      hasFrontmatter: true,
    });
  });

  it("keeps body content while writing frontmatter", () => {
    const content = "# Body\n\nText";
    const next = writeFrontmatter(content, {
      aliases: ["Body note"],
      status: "draft",
      type: "reference",
      tags: ["docs"],
    });

    expect(next).toContain("aliases:\n  - Body note");
    expect(next).toContain("status: draft");
    expect(next).toContain("type: reference");
    expect(next).toContain("tags:\n  - docs");
    expect(parseFrontmatter(next).body).toBe("# Body\n\nText");
  });

  it("merges editable note properties with existing attributes", () => {
    const content = "---\ncreated: 2026-05-25\nstatus: draft\n---\n# Body";
    const next = mergeNoteProperties(content, {
      aliases: ["Main"],
      status: "active",
      type: "project",
      tags: ["work", "planning"],
    });

    expect(next).toContain("created: 2026-05-25");
    expect(next).toContain("status: active");
    expect(next).toContain("aliases:\n  - Main");
    expect(next).toContain("tags:\n  - work\n  - planning");
    expect(parseFrontmatter(next).body).toBe("# Body");
  });
});
