import { describe, expect, it, vi } from "vitest";
import {
  builtInTemplates,
  getBuiltInTemplateById,
  resolveTemplateById,
  resolveTemplateContent,
  resolveTemplateTitle,
} from "./templates";

describe("templates", () => {
  it("contains unique built-in template ids", () => {
    const ids = builtInTemplates.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves built-in template content and title", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T12:00:00.000Z"));

    const template = resolveTemplateById("daily");

    expect(template.type).toBe("builtin");
    expect(template.suggestedTitle).toBe("2026-05-21");
    expect(template.content).toContain("# Thursday, May 21, 2026");
    expect(template.content).toContain("#journal");

    vi.useRealTimers();
  });

  it("resolves custom templates before returning content", () => {
    const customTemplates = [
      {
        id: "custom-1",
        name: "Custom Plan",
        content: "# Custom",
      },
    ];

    expect(resolveTemplateById("custom-1", customTemplates)).toMatchObject({
      id: "custom-1",
      type: "custom",
      content: "# Custom",
      suggestedTitle: "Custom Plan",
    });
  });

  it("handles missing templates safely", () => {
    expect(getBuiltInTemplateById("missing")).toBeNull();
    expect(resolveTemplateById("missing")).toBeNull();
    expect(resolveTemplateContent(null)).toBe("");
    expect(resolveTemplateTitle(null)).toBeNull();
  });
});
