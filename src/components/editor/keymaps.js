import { indentLess, insertTab } from '@codemirror/commands';

// Custom keymaps for Marky
// Note: Cmd+S handled at App level, toolbar formatting shortcuts (Cmd+B, Cmd+I, Cmd+K) in Toolbar.jsx
export const markyKeymaps = [
  // Tab for indentation
  {
    key: 'Tab',
    run: insertTab,
  },
  // Shift+Tab for outdent
  {
    key: 'Shift-Tab',
    run: indentLess,
  },
];
