import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { vim, getCM, Vim, CodeMirror } from "@replit/codemirror-vim";
import { setVimVisualLineMotion, isVimVisualLineMotionApplied } from "./vimSetup";

// A narrow editor whose lines wrap, so a single logical line covers several
// display rows — the situation that makes plain `j` skip whole paragraphs.
const WRAP_WIDTH = 120;

const makeView = (doc) => {
  const parent = document.createElement("div");
  parent.style.width = `${WRAP_WIDTH}px`;
  document.body.appendChild(parent);

  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [EditorView.lineWrapping, vim()],
    }),
    parent,
  });
  return { view, parent };
};

describe("setVimVisualLineMotion", () => {
  beforeEach(() => {
    setVimVisualLineMotion(false);
  });

  afterEach(() => {
    setVimVisualLineMotion(false);
  });

  it("starts out unapplied", () => {
    expect(isVimVisualLineMotionApplied()).toBe(false);
  });

  it("tracks applied state and is idempotent", () => {
    const noremap = vi.spyOn(Vim, "noremap");
    const unmap = vi.spyOn(Vim, "unmap");

    setVimVisualLineMotion(true);
    expect(isVimVisualLineMotionApplied()).toBe(true);
    // 4 motions x 2 contexts
    expect(noremap).toHaveBeenCalledTimes(8);

    // A second enable must not stack duplicate mappings onto Vim's shared keymap.
    setVimVisualLineMotion(true);
    expect(noremap).toHaveBeenCalledTimes(8);

    setVimVisualLineMotion(false);
    expect(isVimVisualLineMotionApplied()).toBe(false);
    expect(unmap).toHaveBeenCalledTimes(8);

    noremap.mockRestore();
    unmap.mockRestore();
  });

  it("maps j/k/0/$ in normal and visual context only", () => {
    const calls = [];
    const noremap = vi.spyOn(Vim, "noremap").mockImplementation((lhs, rhs, ctx) => {
      calls.push([lhs, rhs, ctx]);
    });

    setVimVisualLineMotion(true);

    expect(calls).toEqual([
      ["j", "gj", "normal"],
      ["k", "gk", "normal"],
      ["0", "g0", "normal"],
      ["$", "g$", "normal"],
      ["j", "gj", "visual"],
      ["k", "gk", "visual"],
      ["0", "g0", "visual"],
      ["$", "g$", "visual"],
    ]);
    // `operatorPending` is deliberately absent so `dd`/`d$` stay linewise.
    expect(calls.some(([, , ctx]) => ctx === "operatorPending")).toBe(false);

    noremap.mockRestore();
    // The spy swallowed the real calls, so reset the tracked state by hand.
    setVimVisualLineMotion(false);
  });

  // Runs last: it swaps Vim's motion table for spies and there is no API to
  // read the originals back, so the stubs stay in place for the rest of the
  // file. Vitest gives each test file its own module registry, so nothing
  // outside this file sees them.
  it("routes j through the display-line motion instead of the logical-line one", () => {
    const at00 = () => new CodeMirror.Pos(0, 0);
    const byDisplayLines = vi.fn(at00);
    const byLines = vi.fn(at00);
    Vim.defineMotion("moveByDisplayLines", byDisplayLines);
    Vim.defineMotion("moveByLines", byLines);

    const { view, parent } = makeView("a paragraph long enough that it wraps\nsecond");
    const cm = getCM(view);
    expect(cm).toBeTruthy();

    // Off: `j` is the plain logical-line motion, which is what skips a whole
    // wrapped paragraph in one press.
    setVimVisualLineMotion(false);
    Vim.handleKey(cm, "j", "user");
    expect(byLines).toHaveBeenCalled();
    expect(byDisplayLines).not.toHaveBeenCalled();

    byLines.mockClear();

    // On: the same key now runs the display-line motion.
    setVimVisualLineMotion(true);
    Vim.handleKey(cm, "j", "user");
    expect(byDisplayLines).toHaveBeenCalled();
    expect(byLines).not.toHaveBeenCalled();

    view.destroy();
    parent.remove();
  });
});
