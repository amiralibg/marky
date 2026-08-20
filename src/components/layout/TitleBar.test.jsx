import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

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
