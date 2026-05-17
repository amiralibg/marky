import { indentLess, insertTab } from "@codemirror/commands";
import { closeSearchPanel, openSearchPanel, searchPanelOpen } from "@codemirror/search";

const FORMAT_ACTIONS = {
  bold: { before: "**", after: "**", placeholder: "bold text" },
  italic: { before: "*", after: "*", placeholder: "italic text" },
  link: { before: "[", after: "](https://)", placeholder: "link text" },
  codeBlock: { before: "```\n", after: "\n```", placeholder: "code" },
  list: { before: "- ", after: "", placeholder: "item" },
};

const toCodeMirrorKey = (keymap) => {
  if (!keymap?.key) return null;

  const prefixes = [];
  if (keymap.modifiers?.includes("mod")) prefixes.push("Mod");
  if (keymap.modifiers?.includes("shift")) prefixes.push("Shift");
  if (keymap.modifiers?.includes("alt")) prefixes.push("Alt");

  const key = keymap.key.length === 1 ? keymap.key.toLowerCase() : keymap.key;
  prefixes.push(key);
  return prefixes.join("-");
};

const toggleSearchPanel = (view) =>
  searchPanelOpen(view.state) ? closeSearchPanel(view) : openSearchPanel(view);

const insertMarkdown = (view, before, after = "", placeholder = "") => {
  const { from, to } = view.state.selection.main;
  const selectedText = view.state.sliceDoc(from, to);
  const insertedText = before + (selectedText || placeholder) + after;
  const cursorPosition = from + before.length + (selectedText || placeholder).length;

  view.dispatch({
    changes: { from, to, insert: insertedText },
    selection: { anchor: cursorPosition },
    scrollIntoView: true,
  });

  return true;
};

export const buildMarkyKeymaps = (editorSearchKeymap, formattingKeymaps = {}) => {
  const keymaps = [
    {
      key: "Tab",
      run: insertTab,
    },
    {
      key: "Shift-Tab",
      run: indentLess,
    },
  ];

  const searchKey = toCodeMirrorKey(editorSearchKeymap);
  if (searchKey) {
    keymaps.push({
      key: searchKey,
      run: toggleSearchPanel,
      scope: "editor search-panel",
      preventDefault: true,
    });
  }

  Object.entries(FORMAT_ACTIONS).forEach(([actionId, format]) => {
    const key = toCodeMirrorKey(formattingKeymaps[actionId]);
    if (!key) return;

    keymaps.push({
      key,
      run: (view) => insertMarkdown(view, format.before, format.after, format.placeholder),
      preventDefault: true,
    });
  });

  return keymaps;
};
