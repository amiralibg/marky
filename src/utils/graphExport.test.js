import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

describe("buildGraphSvg", () => {
  it("builds an escaped SVG with graph nodes and edges", async () => {
    document.documentElement.style.setProperty("--color-accent", "#38bdf8");
    document.documentElement.style.setProperty("--color-bg-editor", "#111827");
    document.documentElement.style.setProperty("--color-text-primary", "#f9fafb");
    document.documentElement.style.setProperty("--color-text-secondary", "#d1d5db");
    document.documentElement.style.setProperty("--color-text-muted", "#9ca3af");
    document.documentElement.style.setProperty("--color-border", "#374151");

    const { buildGraphSvg } = await import("./graphExport");
    const source = { id: "1", name: "Home & Start", x: 0, y: 0, backlinkCount: 0 };
    const target = { id: "2", name: "Project <Plan>", x: 120, y: 80, backlinkCount: 2 };

    const result = buildGraphSvg({
      nodes: [source, target],
      edges: [{ source, target }],
      currentNoteId: "2",
      title: "Graph <Export>",
    });

    expect(result.width).toBeGreaterThanOrEqual(800);
    expect(result.height).toBeGreaterThanOrEqual(600);
    expect(result.svg).toContain("<title>Graph &lt;Export&gt;</title>");
    expect(result.svg).toContain("Home &amp; Start");
    expect(result.svg).toContain("Project &lt;Plan&gt;");
    expect(result.svg).toContain("<line");
  });
});
