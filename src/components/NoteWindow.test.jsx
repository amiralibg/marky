import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const readMarkdownFile = vi.fn();
const writeMarkdownFileOnDisk = vi.fn();
vi.mock("../utils/fileSystem", () => ({
  readMarkdownFile: (...a) => readMarkdownFile(...a),
  writeMarkdownFileOnDisk: (...a) => writeMarkdownFileOnDisk(...a),
}));

const addNoteHistorySnapshot = vi.fn();
const setDraftCacheEntry = vi.fn();
const removeDraftCacheEntry = vi.fn();
vi.mock("../utils/sideStore", () => ({
  addNoteHistorySnapshot: (...a) => addNoteHistorySnapshot(...a),
  setDraftCacheEntry: (...a) => setDraftCacheEntry(...a),
  removeDraftCacheEntry: (...a) => removeDraftCacheEntry(...a),
}));

const setTitle = vi.fn(() => Promise.resolve());
const close = vi.fn();
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setTitle, close }),
}));

// CodeMirror needs layout APIs jsdom lacks; the editor itself is covered by
// livePreview.test.js. Here it stands in as a plain textarea so the window's own
// load/edit/save wiring is what gets tested.
vi.mock("./editor/CodeMirrorEditor", () => ({
  default: ({ value, onChange, ariaLabel }) => (
    <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("./editor/EditorScrollFade", () => ({
  default: ({ children }) => <div>{children}</div>,
}));

const NoteWindow = (await import("./NoteWindow")).default;
const useSettingsStore = (await import("../store/settingsStore")).default;

const setSaveMode = (mode) => useSettingsStore.setState({ saveMode: mode });

beforeEach(() => {
  readMarkdownFile.mockReset().mockResolvedValue("# Hello");
  writeMarkdownFileOnDisk.mockReset().mockResolvedValue(undefined);
  addNoteHistorySnapshot.mockReset();
  setDraftCacheEntry.mockReset();
  removeDraftCacheEntry.mockReset();
  setTitle.mockClear();
  close.mockClear();
  setSaveMode("auto");
});

describe("NoteWindow", () => {
  it("loads its file and shows it as saved", async () => {
    render(<NoteWindow filePath="/vault/Hello.md" />);

    const editor = await screen.findByLabelText("Editor for Hello.md");
    expect(editor).toHaveValue("# Hello");
    expect(readMarkdownFile).toHaveBeenCalledWith("/vault/Hello.md");
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("marks unsaved edits and records them as a draft in manual mode", async () => {
    setSaveMode("manual");
    const user = userEvent.setup();
    render(<NoteWindow filePath="/vault/Hello.md" />);
    const editor = await screen.findByLabelText("Editor for Hello.md");

    await user.type(editor, "!");

    expect(screen.getByText(/Unsaved/)).toBeInTheDocument();
    // Unsaved work goes to the same on-disk draft store the main window reads.
    expect(setDraftCacheEntry).toHaveBeenCalledWith("/vault/Hello.md", "# Hello!");
  });

  it("writes the file on its own once typing stops", async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ saveMode: "auto", autosaveDelay: 20 });
    render(<NoteWindow filePath="/vault/Hello.md" />);
    const editor = await screen.findByLabelText("Editor for Hello.md");

    await user.type(editor, "!");

    // No Cmd+S: the window saves itself.
    await waitFor(() =>
      expect(writeMarkdownFileOnDisk).toHaveBeenCalledWith("/vault/Hello.md", "# Hello!")
    );
    await waitFor(() => expect(removeDraftCacheEntry).toHaveBeenCalledWith("/vault/Hello.md"));
  });

  it("saves on Cmd+S and clears the draft", async () => {
    setSaveMode("manual");
    const user = userEvent.setup();
    render(<NoteWindow filePath="/vault/Hello.md" />);
    const editor = await screen.findByLabelText("Editor for Hello.md");
    await user.type(editor, "!");

    await user.keyboard("{Meta>}s{/Meta}");

    await waitFor(() => expect(writeMarkdownFileOnDisk).toHaveBeenCalled());
    expect(writeMarkdownFileOnDisk).toHaveBeenCalledWith("/vault/Hello.md", "# Hello!");
    expect(addNoteHistorySnapshot).toHaveBeenCalledWith("/vault/Hello.md", "# Hello!");
    expect(removeDraftCacheEntry).toHaveBeenCalledWith("/vault/Hello.md");
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
  });

  it("marks the title bar when there are unsaved changes in manual mode", async () => {
    setSaveMode("manual");
    const user = userEvent.setup();
    render(<NoteWindow filePath="/vault/Hello.md" />);
    const editor = await screen.findByLabelText("Editor for Hello.md");

    await waitFor(() => expect(setTitle).toHaveBeenCalledWith("Hello.md"));
    await user.type(editor, "!");
    await waitFor(() => expect(setTitle).toHaveBeenCalledWith("• Hello.md"));
  });

  it("leaves the title alone while auto-saving", async () => {
    const user = userEvent.setup();
    render(<NoteWindow filePath="/vault/Hello.md" />);
    const editor = await screen.findByLabelText("Editor for Hello.md");

    await waitFor(() => expect(setTitle).toHaveBeenCalledWith("Hello.md"));
    await user.type(editor, "!");
    // A bullet that appears and vanishes every couple of seconds is noise.
    expect(setTitle).not.toHaveBeenCalledWith("• Hello.md");
  });

  it("shows a readable message when the file cannot be opened", async () => {
    readMarkdownFile.mockRejectedValue(new Error("“Gone.md” no longer exists on disk."));

    render(<NoteWindow filePath="/vault/Gone.md" />);

    expect(await screen.findByText(/no longer exists on disk/)).toBeInTheDocument();
  });

  it("surfaces a failed save instead of silently claiming success", async () => {
    setSaveMode("manual");
    const user = userEvent.setup();
    writeMarkdownFileOnDisk.mockRejectedValue(new Error("Permission denied"));

    render(<NoteWindow filePath="/vault/Hello.md" />);
    const editor = await screen.findByLabelText("Editor for Hello.md");
    await user.type(editor, "!");
    await user.keyboard("{Meta>}s{/Meta}");

    expect(await screen.findByText(/Permission denied/)).toBeInTheDocument();
  });
});
