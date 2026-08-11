import { Vim, getCM, CodeMirror } from "@replit/codemirror-vim";
import { EditorView } from "@codemirror/view";
import { blockStepRepair } from "./livePreview";

// ────────────────────────────────────────────────────────────────────────────
// Vim motions that follow the *screen*, not the source
//
// Marky soft-wraps (`EditorView.lineWrapping`), so a markdown paragraph is one
// logical line spread over many rows. Vim's `j`/`k`/`0`/`$` operate on logical
// lines, which means a single `j` jumps the whole paragraph — the cursor never
// visits the rows in between. Remapping them to their display-line twins
// (`gj`/`gk`/`g0`/`g$`) makes navigation match what the reader sees.
//
// Only `normal` and `visual` are remapped. While an operator is pending the
// dispatcher switches to the `operatorPending` context, which these mappings
// deliberately don't cover, so `dd`, `dj`, `d$`, `y$`, `c0` … keep their
// familiar whole-line semantics.
//
// `<Up>`/`<Down>` need no entry of their own: the default keymap expands them
// to `k`/`j`, which then resolve through these mappings.
//
// `^` is left alone on purpose — its display-line twin `g^` lands on the first
// *column* of the row rather than the first non-blank character, which would
// break the common "jump to the `-` of a list item" move.
// ────────────────────────────────────────────────────────────────────────────

const DISPLAY_LINE_MAPS = [
  ["j", "gj"],
  ["k", "gk"],
  ["0", "g0"],
  ["$", "g$"],
];

const CONTEXTS = ["normal", "visual"];

// Vim's keymap is module-level state shared by every editor instance, so the
// mappings are applied once and tracked here rather than per-view.
let applied = false;

/**
 * Enable or disable display-line `j`/`k`/`0`/`$`. Idempotent — safe to call on
 * every editor re-creation.
 *
 * @param {boolean} enabled
 */
export function setVimVisualLineMotion(enabled) {
  const next = Boolean(enabled);
  if (next === applied) return;

  for (const ctx of CONTEXTS) {
    for (const [lhs, rhs] of DISPLAY_LINE_MAPS) {
      // `noremap` so the right-hand side resolves against the built-in keymap
      // only — `gj` can never be re-expanded through a user mapping.
      if (next) Vim.noremap(lhs, rhs, ctx);
      else Vim.unmap(lhs, ctx);
    }
  }

  applied = next;
}

/** Test hook: current applied state. */
export function isVimVisualLineMotionApplied() {
  return applied;
}

const isBefore = (a, b) => a.line < b.line || (a.line === b.line && a.ch < b.ch);

const toVimPos = (state, offset) => {
  const line = state.doc.lineAt(offset);
  return new CodeMirror.Pos(line.number - 1, offset - line.from);
};

/**
 * Re-read vim's visual selection after Live Preview redirects a vertical step
 * into a rendered block. See `blockStepRepair` for why vim misses the change.
 *
 * Only visual mode needs this, and only the selection: vim's range is inclusive
 * where CodeMirror's is exclusive, so the trailing end sits one character back
 * — the same adjustment the vim addon makes for a selection dragged with the
 * mouse.
 */
export const vimBlockStepSync = EditorView.updateListener.of((update) => {
  if (!update.transactions.some((tr) => tr.effects.some((e) => e.is(blockStepRepair)))) return;
  const vimState = getCM(update.view)?.state?.vim;
  if (!vimState?.visualMode) return;

  const { state } = update;
  const main = state.selection.main;
  let anchor = toVimPos(state, main.anchor);
  let head = toVimPos(state, main.head);
  const back = (pos) => new CodeMirror.Pos(pos.line, Math.max(0, pos.ch - 1));
  if (isBefore(head, anchor)) anchor = back(anchor);
  else head = back(head);

  vimState.sel = { anchor, head };
});
