import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/fileSystem", () => ({
  readMarkdownFile: vi.fn(),
  createFolderOnDisk: vi.fn(),
  createMarkdownFileOnDisk: vi.fn(),
  renameEntryOnDisk: vi.fn(),
  deleteEntryOnDisk: vi.fn(),
  moveEntryOnDisk: vi.fn(),
  readWorkspaceFiles: vi.fn(),
  scanWorkspaceAttachments: vi.fn(async () => []),
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

    store
      .getState()
      .updateNote(homeNote.id, "---\ntags:\n  - frontmatter\n---\n# Home\n#updated\n[[Project]]");
    expect(store.getState().dirtyNoteIds).toContain(homeNote.id);

    store
      .getState()
      .updateNoteMetadata(
        homeNote.id,
        "---\ntags:\n  - frontmatter\nstatus: active\n---\n# Home\n#updated\n[[Project]]"
      );
    const updated = store.getState().items.find((item) => item.id === homeNote.id);

    expect(updated.tags).toEqual(["frontmatter", "updated"]);
    expect(updated.properties.status).toBe("active");
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

describe("workspace refresh reads only what changed", () => {
  // The whole workspace now arrives in one call instead of a scan plus one IPC
  // round-trip per note. Deciding what to re-read happens in Rust; what the
  // store owns is sending accurate `known` stats and honouring a null content.
  const entry = (name, modified, size, content = `content of ${name}`) => ({
    name,
    path: `/workspace/${name}`,
    is_dir: false,
    modified,
    size,
    content,
  });

  let fs;

  beforeEach(async () => {
    window.localStorage.clear();
    fs = await import("../utils/fileSystem");
    fs.readWorkspaceFiles.mockReset();
  });

  const refreshWith = async (store, entries) => {
    fs.readWorkspaceFiles.mockResolvedValue(entries);
    await store.getState().refreshRootFromDisk({ silent: true });
  };

  const lastKnown = () => fs.readWorkspaceFiles.mock.calls.at(-1)[2];

  it("asks for everything on the first load", async () => {
    const store = await loadStore();
    seedStore(store);
    store.setState({ items: [] });

    await refreshWith(store, [entry("A.md", 1000, 10)]);

    expect(lastKnown()).toEqual([]);
  });

  it("reports the stats of notes it already holds, so they can be skipped", async () => {
    const store = await loadStore();
    seedStore(store);

    await refreshWith(store, [entry("A.md", 1000, 10), entry("B.md", 2000, 20)]);
    await refreshWith(store, [entry("A.md", 1000, 10), entry("B.md", 2000, 20)]);

    expect(lastKnown()).toEqual(
      expect.arrayContaining([
        { path: "/workspace/A.md", modified: 1000, size: 10 },
        { path: "/workspace/B.md", modified: 2000, size: 20 },
      ])
    );
  });

  it("keeps the cached body when the backend says a file is unchanged", async () => {
    const store = await loadStore();
    seedStore(store);

    await refreshWith(store, [entry("A.md", 1000, 10, "original body")]);
    // `content: null` is the backend's "unchanged, reuse what you have".
    await refreshWith(store, [entry("A.md", 1000, 10, null)]);

    const note = store.getState().items.find((i) => i.filePath === "/workspace/A.md");
    expect(note.content).toBe("original body");
  });

  it("takes the new body when the backend sends one", async () => {
    const store = await loadStore();
    seedStore(store);

    await refreshWith(store, [entry("A.md", 1000, 10, "original body")]);
    await refreshWith(store, [entry("A.md", 3000, 25, "edited body")]);

    const note = store.getState().items.find((i) => i.filePath === "/workspace/A.md");
    expect(note.content).toBe("edited body");
  });

  it("omits notes with unknown stats from `known`, so they are always re-read", async () => {
    const store = await loadStore();
    seedStore(store);

    // `0` means "no metadata", which must never be reported as a known state.
    await refreshWith(store, [entry("A.md", 0, 0), entry("B.md", 2000, 20)]);
    await refreshWith(store, [entry("A.md", 0, 0), entry("B.md", 2000, 20)]);

    expect(lastKnown()).toEqual([{ path: "/workspace/B.md", modified: 2000, size: 20 }]);
  });
});

describe("persisted shape", () => {
  // localStorage holds ~5 MB. Persisting note bodies put the whole vault in
  // there on every store change, for content that `refreshRootFromDisk`
  // re-reads from disk on the next launch anyway.
  const readPersisted = () => JSON.parse(window.localStorage.getItem("marky-storage")).state;

  it("persists vault notes without their content", async () => {
    const store = await loadStore();
    seedStore(store);
    // Nudge the store so persist middleware flushes.
    store.setState({ sidebarWidth: 281 });

    const persisted = readPersisted();
    const note = persisted.items.find((item) => item.id === homeNote.id);

    expect(note).toBeDefined();
    expect(note.content).toBeNull();
    // Metadata the sidebar needs before the disk read finishes still survives.
    expect(note.name).toBe("Home");
    expect(note.filePath).toBe("/workspace/Home.md");
  });

  it("keeps content for scratch buffers and loose files, which have no disk copy", async () => {
    const store = await loadStore();
    seedStore(store);

    const scratch = { id: "note::scratch", name: "Scratch", type: "note", content: "unsaved" };
    const loose = {
      ...homeNote,
      id: "note::/elsewhere/Loose.md",
      filePath: "/elsewhere/Loose.md",
      isLoose: true,
      content: "loose body",
    };
    store.setState({ items: [rootFolder, homeNote, scratch, loose] });

    const persisted = readPersisted();

    expect(persisted.items.find((i) => i.id === "note::scratch").content).toBe("unsaved");
    expect(persisted.items.find((i) => i.id === loose.id).content).toBe("loose body");
  });
});
