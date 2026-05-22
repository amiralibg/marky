import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/fileSystem", () => ({
  readMarkdownFile: vi.fn(),
  createFolderOnDisk: vi.fn(),
  createMarkdownFileOnDisk: vi.fn(),
  renameEntryOnDisk: vi.fn(),
  deleteEntryOnDisk: vi.fn(),
  moveEntryOnDisk: vi.fn(),
  scanFolder: vi.fn(),
  writeMarkdownFileOnDisk: vi.fn(),
}));

const rootFolder = {
  id: "folder::/workspace",
  name: "workspace",
  parentId: null,
  type: "folder",
  filePath: "/workspace",
  normalizedPath: "/workspace",
};

const homeNote = {
  id: "note::/workspace/Home.md",
  name: "Home",
  parentId: rootFolder.id,
  type: "note",
  filePath: "/workspace/Home.md",
  normalizedPath: "/workspace/Home.md",
  content: "# Home\n#project\n[[Project]]\n[[Missing|Alias]]",
  linkKey: "home",
  links: [
    { key: "project", target: "Project", alias: null },
    { key: "missing", target: "Missing", alias: "Alias" },
  ],
  tags: ["project"],
};

const projectNote = {
  id: "note::/workspace/Project.md",
  name: "Project",
  parentId: rootFolder.id,
  type: "note",
  filePath: "/workspace/Project.md",
  normalizedPath: "/workspace/Project.md",
  content: "# Project\n#project #active",
  linkKey: "project",
  links: [],
  tags: ["active", "project"],
};

const loadStore = async () => {
  const module = await import("./notesStore");
  return module.default;
};

const seedStore = (store) => {
  store.setState({
    items: [rootFolder, homeNote, projectNote],
    currentNoteId: null,
    openNoteIds: [],
    dirtyNoteIds: [],
    noteConflicts: {},
    recoveredDrafts: {},
    expandedFolders: [rootFolder.id],
    rootFolderPath: "/workspace",
    rootFolderId: rootFolder.id,
    recentNotes: [],
    pinnedNotes: [],
    selectedTags: [],
    customTemplates: [],
    scheduledNotes: [],
  });
};

describe("notesStore core behavior", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T12:00:00.000Z"));
    window.localStorage.clear();
    const store = await loadStore();
    store.getState().resetStore();
    seedStore(store);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("selects notes, opens tabs, and records recents", async () => {
    const store = await loadStore();

    store.getState().selectNote(homeNote.id);

    expect(store.getState().currentNoteId).toBe(homeNote.id);
    expect(store.getState().openNoteIds).toEqual([homeNote.id]);
    expect(store.getState().recentNotes[0]).toMatchObject({
      id: homeNote.id,
      name: "Home",
      filePath: "/workspace/Home.md",
    });
  });

  it("tracks dirty notes and metadata updates", async () => {
    const store = await loadStore();

    store.getState().updateNote(homeNote.id, "# Home\n#updated\n[[Project]]");
    expect(store.getState().dirtyNoteIds).toContain(homeNote.id);

    store.getState().updateNoteMetadata(homeNote.id, "# Home\n#updated\n[[Project]]");
    const updated = store.getState().items.find((item) => item.id === homeNote.id);

    expect(updated.tags).toEqual(["updated"]);
    expect(updated.links).toEqual([{ key: "project", target: "Project", alias: null }]);
  });

  it("computes tags, outgoing links, backlinks, and broken wiki links", async () => {
    const store = await loadStore();

    expect(store.getState().getAllTags()).toEqual([
      { tag: "project", count: 2 },
      { tag: "active", count: 1 },
    ]);
    expect(store.getState().getOutgoingLinks(homeNote.id)).toEqual([
      { key: "project", target: "Project", alias: null, note: projectNote },
      { key: "missing", target: "Missing", alias: "Alias", note: null },
    ]);
    expect(store.getState().getBacklinks(projectNote.id)).toEqual([homeNote]);
    expect(store.getState().getBrokenWikiLinks()).toEqual([
      {
        key: "missing",
        target: "Missing",
        alias: "Alias",
        sources: [{ id: homeNote.id, name: "Home", filePath: "/workspace/Home.md" }],
      },
    ]);
  });

  it("toggles pinned notes and filters removed pins", async () => {
    const store = await loadStore();

    store.getState().togglePinNote(projectNote.id);
    expect(store.getState().isPinned(projectNote.id)).toBe(true);
    expect(store.getState().getPinnedNotes()).toEqual([projectNote]);

    store.setState({ items: [rootFolder, homeNote] });
    expect(store.getState().getPinnedNotes()).toEqual([]);
  });

  it("opens an existing daily note instead of creating a duplicate", async () => {
    const store = await loadStore();
    const dailyNote = {
      ...homeNote,
      id: "note::/workspace/2026-05-21.md",
      name: "2026-05-21",
      filePath: "/workspace/2026-05-21.md",
      normalizedPath: "/workspace/2026-05-21.md",
      linkKey: "2026-05-21",
    };
    store.setState({ items: [rootFolder, dailyNote] });

    const id = await store.getState().createDailyNote(new Date("2026-05-21T12:00:00.000Z"));

    expect(id).toBe(dailyNote.id);
    expect(store.getState().currentNoteId).toBe(dailyNote.id);
  });
});
