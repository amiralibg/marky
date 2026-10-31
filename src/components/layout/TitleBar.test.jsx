import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/window", () => ({
  // The title bar falls back to a no-op controller when this throws, which is
  // the path a jsdom render takes anyway.
  getCurrentWindow: () => {
    throw new Error("no tauri runtime");
  },
}));

import TitleBar from "./TitleBar";
import useNotesStore from "../../store/notesStore";

const props = (showSidebar) => ({
  sidebarWidth: 260,
  showSidebar,
  onNewNote: () => {},
  onNewFolder: () => {},
  onToggleSidebar: () => {},
});

/**
 * Renders the bar and settles it. The mount effect asks the window whether it
 * is maximized and sets state when that promise resolves, so without a flush
 * every test trails an act() warning for work it never asked for.
 */
const renderTitleBar = async (showSidebar = true) => {
  let view;
  await act(async () => {
    view = render(<TitleBar {...props(showSidebar)} />);
  });
  return {
    ...view,
    toggleTo: (next) => view.rerender(<TitleBar {...props(next)} />),
  };
};

beforeEach(() => {
  useNotesStore.setState({ openNoteIds: [], currentNoteId: null, items: [] });
});

describe("TitleBar sidebar toggle", () => {
  it("offers exactly one toggle in either state", async () => {
    // This used to be two buttons written out separately, one per branch, and
    // their classes had already drifted apart. One button, two labels.
    const { toggleTo } = await renderTitleBar(true);
    expect(screen.getAllByRole("button", { name: /sidebar/i })).toHaveLength(1);

    toggleTo(false);

    expect(screen.getAllByRole("button", { name: /sidebar/i })).toHaveLength(1);
  });

  it("labels itself with the move the next click makes", async () => {
    const { toggleTo } = await renderTitleBar(true);
    expect(screen.getByRole("button", { name: /hide sidebar/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );

    toggleTo(false);

    expect(screen.getByRole("button", { name: /show sidebar/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("hides the note and folder actions along with the sidebar", async () => {
    const { toggleTo } = await renderTitleBar(true);
    expect(screen.getByTitle(/new note/i)).toBeInTheDocument();

    toggleTo(false);

    expect(screen.queryByTitle(/new note/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Marky")).not.toBeInTheDocument();
  });
});

describe("SidebarIcon", () => {
  it("turns the chevron around with the sidebar", async () => {
    // The two chevrons are mirror images about x=13.69, so the only thing
    // separating "collapse" from "expand" is which end the apex sits at. Easy
    // to get backwards, and backwards it points users the wrong way.
    // Scoped to the toggle: the window controls draw their own paths, and the
    // last one in the document is the close button's X.
    const chevron = () =>
      [...screen.getByRole("button", { name: /sidebar/i }).querySelectorAll("svg path")]
        .at(-1)
        .getAttribute("d");

    const { toggleTo } = await renderTitleBar(true);
    expect(chevron()).toBe("M14.97 9.43994L12.41 11.9999L14.97 14.5599");

    toggleTo(false);

    expect(chevron()).toBe("M12.41 9.43994L14.97 11.9999L12.41 14.5599");
  });
});

describe("TitleBar tabs and edge dissolve", () => {
  it("renders open notes with scrollPadding and comfortable spacing", async () => {
    useNotesStore.setState({
      openNoteIds: ["note-1", "note-2"],
      currentNoteId: "note-1",
      items: [
        { id: "note-1", name: "First Note" },
        { id: "note-2", name: "Second Note" },
      ],
    });

    await renderTitleBar(true);

    const tablist = screen.getByRole("tablist", { name: /open notes/i });
    expect(tablist).toBeInTheDocument();
    expect(tablist.style.scrollPadding).toBe("0 28px");
    expect(screen.getByRole("tab", { name: /first note/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /second note/i })).toBeInTheDocument();
  });

  it("translates vertical wheel deltas into horizontal scroll on tabs", async () => {
    useNotesStore.setState({
      openNoteIds: ["note-1", "note-2"],
      currentNoteId: "note-1",
      items: [
        { id: "note-1", name: "First Note" },
        { id: "note-2", name: "Second Note" },
      ],
    });

    await renderTitleBar(true);

    const tablist = screen.getByRole("tablist", { name: /open notes/i });
    const scrollByMock = vi.fn();
    tablist.scrollBy = scrollByMock;

    act(() => {
      tablist.dispatchEvent(
        new WheelEvent("wheel", {
          deltaX: 0,
          deltaY: 50,
          bubbles: true,
          cancelable: true,
        })
      );
    });

    expect(scrollByMock).toHaveBeenCalledWith({ left: 50, behavior: "auto" });
  });

  it("applies mask and renders edge blur overlays when tabs overflow and scroll", async () => {
    useNotesStore.setState({
      openNoteIds: ["note-1", "note-2"],
      currentNoteId: "note-1",
      items: [
        { id: "note-1", name: "First Note" },
        { id: "note-2", name: "Second Note" },
      ],
    });

    await renderTitleBar(true);

    const tablist = screen.getByRole("tablist", { name: /open notes/i });

    // Mock dimensions to simulate overflowing tabs in the middle of scroll
    Object.defineProperty(tablist, "scrollWidth", { value: 600, configurable: true });
    Object.defineProperty(tablist, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(tablist, "scrollLeft", { value: 100, configurable: true });

    act(() => {
      fireEvent.scroll(tablist);
    });

    // Blur overlays should be rendered for both left and right edges
    const parentContainer = tablist.parentElement;
    const blurOverlays = parentContainer.querySelectorAll('[aria-hidden="true"]');
    expect(blurOverlays).toHaveLength(2);
  });
});
