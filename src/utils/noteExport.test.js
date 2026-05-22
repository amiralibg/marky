import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeFile: vi.fn(),
}));

describe("buildStandaloneHtml", () => {
  it("wraps rendered markdown in a standalone HTML document", async () => {
    const { buildStandaloneHtml } = await import("./noteExport");
    const html = buildStandaloneHtml("Note", "# Hello", (markdown) => `<h1>${markdown}</h1>`);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>Note</title>");
    expect(html).toContain("<h1># Hello</h1>");
    expect(html).toContain("body {");
  });

  it("escapes unsafe note titles", async () => {
    const { buildStandaloneHtml } = await import("./noteExport");
    const html = buildStandaloneHtml(
      "<script>alert('x')</script>",
      "content",
      () => "<p>content</p>"
    );

    expect(html).toContain("<title>&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;</title>");
    expect(html).not.toContain("<title><script>");
  });
});
