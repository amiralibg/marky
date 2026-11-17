import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import SearchModal from "./SearchModal";
import useNotesStore from "../../store/notesStore";

const report = {
  id: "note::/v/Q3 report.html",
  name: "Q3 report",
  type: "note",
  kind: "html",
  filePath: "/v/Q3 report.html",
  content:
    '<html><head><style>.kpi-card{color:#fff}</style></head><body><h1>Quarterly numbers</h1><p class="kpi-card">Downloads compounded again</p></body></html>',
  tags: [],
};

const note = {
  id: "note::/v/Plan.md",
  name: "Plan",
  type: "note",
  kind: "markdown",
  filePath: "/v/Plan.md",
  content: "# Plan\n\nShip the editor",
  tags: [],
};

const search = async (query) => {
  const input = screen.getByRole("combobox", { hidden: true }) ?? screen.getByRole("textbox");
  await act(async () => {
    fireEvent.change(input, { target: { value: query } });
  });
};

beforeEach(() => {
  window.localStorage.clear();
  useNotesStore.setState({ items: [report, note] });
});

describe("SearchModal with HTML documents", () => {
  it("finds an HTML document by the words on its page", async () => {
    render(<SearchModal isOpen onClose={() => {}} />);
    await search("compounded");
    expect(screen.getByRole("option", { name: /Q3 report/ })).toBeInTheDocument();
  });

  it("does not match the document's markup", async () => {
    render(<SearchModal isOpen onClose={() => {}} />);
    await search("kpi-card");
    expect(screen.queryByRole("option", { name: /Q3 report/ })).toBeNull();
  });
});
