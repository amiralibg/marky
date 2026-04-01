import { indentLess, insertTab } from '@codemirror/commands';
import { closeSearchPanel, openSearchPanel, searchPanelOpen } from '@codemirror/search';

const toCodeMirrorKey = (keymap) => {
  if (!keymap?.key) return null;

  const prefixes = [];
  if (keymap.modifiers?.includes('mod')) prefixes.push('Mod');
  if (keymap.modifiers?.includes('shift')) prefixes.push('Shift');
  if (keymap.modifiers?.includes('alt')) prefixes.push('Alt');

  const key = keymap.key.length === 1 ? keymap.key.toLowerCase() : keymap.key;
  prefixes.push(key);
  return prefixes.join('-');
};

const toggleSearchPanel = (view) => (
  searchPanelOpen(view.state) ? closeSearchPanel(view) : openSearchPanel(view)
);

export const buildMarkyKeymaps = (editorSearchKeymap) => {
  const keymaps = [
    {
      key: 'Tab',
      run: insertTab,
    },
    {
      key: 'Shift-Tab',
      run: indentLess,
    },
  ];

  const searchKey = toCodeMirrorKey(editorSearchKeymap);
  if (searchKey) {
    keymaps.push({
      key: searchKey,
      run: toggleSearchPanel,
      scope: 'editor search-panel',
      preventDefault: true,
    });
  }

  return keymaps;
};
