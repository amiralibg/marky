import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Theme definitions
export const THEMES = [
  {
    id: 'midnight',
    name: 'Midnight',
    type: 'dark',
    preview: { bg: '#09090b', sidebar: '#121215', accent: '#18181b' },
    colors: {
      bgBase: '#09090b',
      bgSidebar: '#121215',
      bgEditor: '#0c0c0e',
      overlayBg: 'rgba(9, 9, 11, 0.8)',
      glassBorder: 'rgba(255, 255, 255, 0.08)',
      glassHighlight: 'rgba(255, 255, 255, 0.03)',
      glassPanelBg: 'rgba(18, 18, 21, 0.7)',
      textPrimary: '#f4f4f5',
      textSecondary: '#a1a1aa',
      textMuted: '#52525b',
      border: '#27272a',
      borderLight: '#3f3f46',
      itemHover: '#18181b',
      itemActive: '#27272a',
      titlebarBg: '#09090b',
    }
  },
  {
    id: 'charcoal',
    name: 'Charcoal',
    type: 'dark',
    preview: { bg: '#1a1a1e', sidebar: '#222226', accent: '#27272a' },
    colors: {
      bgBase: '#1a1a1e',
      bgSidebar: '#222226',
      bgEditor: '#1e1e22',
      overlayBg: 'rgba(26, 26, 30, 0.85)',
      glassBorder: 'rgba(255, 255, 255, 0.1)',
      glassHighlight: 'rgba(255, 255, 255, 0.04)',
      glassPanelBg: 'rgba(34, 34, 38, 0.75)',
      textPrimary: '#f4f4f5',
      textSecondary: '#a1a1aa',
      textMuted: '#71717a',
      border: '#3f3f46',
      borderLight: '#52525b',
      itemHover: '#27272a',
      itemActive: '#3f3f46',
      titlebarBg: '#1a1a1e',
    }
  },
  {
    id: 'slate',
    name: 'Slate',
    type: 'dark',
    preview: { bg: '#0f172a', sidebar: '#1e293b', accent: '#334155' },
    colors: {
      bgBase: '#0f172a',
      bgSidebar: '#1e293b',
      bgEditor: '#131c2e',
      overlayBg: 'rgba(15, 23, 42, 0.85)',
      glassBorder: 'rgba(255, 255, 255, 0.1)',
      glassHighlight: 'rgba(255, 255, 255, 0.04)',
      glassPanelBg: 'rgba(30, 41, 59, 0.75)',
      textPrimary: '#f1f5f9',
      textSecondary: '#94a3b8',
      textMuted: '#64748b',
      border: '#334155',
      borderLight: '#475569',
      itemHover: '#1e293b',
      itemActive: '#334155',
      titlebarBg: '#0f172a',
    }
  },
  {
    id: 'light',
    name: 'Snow',
    type: 'light',
    preview: { bg: '#ffffff', sidebar: '#f8fafc', accent: '#e2e8f0' },
    colors: {
      bgBase: '#ffffff',
      bgSidebar: '#f8fafc',
      bgEditor: '#ffffff',
      overlayBg: 'rgba(255, 255, 255, 0.9)',
      glassBorder: 'rgba(0, 0, 0, 0.08)',
      glassHighlight: 'rgba(0, 0, 0, 0.02)',
      glassPanelBg: 'rgba(248, 250, 252, 0.9)',
      textPrimary: '#0f172a',
      textSecondary: '#475569',
      textMuted: '#94a3b8',
      border: '#e2e8f0',
      borderLight: '#cbd5e1',
      itemHover: '#f1f5f9',
      itemActive: '#e2e8f0',
      titlebarBg: '#ffffff',
    }
  },
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    type: 'dark',
    preview: { bg: '#282828', sidebar: '#3c3836', accent: '#504945' },
    colors: {
      bgBase: '#282828',
      bgSidebar: '#3c3836',
      bgEditor: '#282828',
      overlayBg: 'rgba(40, 40, 40, 0.85)',
      glassBorder: 'rgba(235, 219, 178, 0.1)',
      glassHighlight: 'rgba(235, 219, 178, 0.04)',
      glassPanelBg: 'rgba(60, 56, 54, 0.75)',
      textPrimary: '#ebdbb2',
      textSecondary: '#d5c4a1',
      textMuted: '#928374',
      border: '#504945',
      borderLight: '#665c54',
      itemHover: '#3c3836',
      itemActive: '#504945',
      titlebarBg: '#282828',
    }
  },
  {
    id: 'gruvbox-light',
    name: 'Gruvbox Light',
    type: 'light',
    preview: { bg: '#fbf1c7', sidebar: '#ebdbb2', accent: '#d5c4a1' },
    colors: {
      bgBase: '#fbf1c7',
      bgSidebar: '#ebdbb2',
      bgEditor: '#fbf1c7',
      overlayBg: 'rgba(251, 241, 199, 0.9)',
      glassBorder: 'rgba(60, 56, 54, 0.1)',
      glassHighlight: 'rgba(60, 56, 54, 0.03)',
      glassPanelBg: 'rgba(235, 219, 178, 0.85)',
      textPrimary: '#3c3836',
      textSecondary: '#504945',
      textMuted: '#928374',
      border: '#d5c4a1',
      borderLight: '#bdae93',
      itemHover: '#ebdbb2',
      itemActive: '#d5c4a1',
      titlebarBg: '#fbf1c7',
    }
  },
];

// Predefined accent colors
export const ACCENT_COLORS = [
  { id: 'blue', name: 'Blue', value: '#3b82f6', hover: '#2563eb' },
  { id: 'purple', name: 'Purple', value: '#8b5cf6', hover: '#7c3aed' },
  { id: 'pink', name: 'Pink', value: '#ec4899', hover: '#db2777' },
  { id: 'red', name: 'Red', value: '#ef4444', hover: '#dc2626' },
  { id: 'orange', name: 'Orange', value: '#f97316', hover: '#ea580c' },
  { id: 'amber', name: 'Amber', value: '#f59e0b', hover: '#d97706' },
  { id: 'green', name: 'Green', value: '#22c55e', hover: '#16a34a' },
  { id: 'teal', name: 'Teal', value: '#14b8a6', hover: '#0d9488' },
  { id: 'cyan', name: 'Cyan', value: '#06b6d4', hover: '#0891b2' },
];

// Default keymaps configuration
export const DEFAULT_KEYMAPS = {
  'newNote': { key: 'n', modifiers: ['mod'], description: 'Create new note' },
  'newFolder': { key: 'N', modifiers: ['mod', 'shift'], description: 'Create new folder' },
  'openFolder': { key: 'o', modifiers: ['mod'], description: 'Open folder' },
  'save': { key: 's', modifiers: ['mod'], description: 'Save current note' },
  'closeTab': { key: 'w', modifiers: ['mod'], description: 'Close current tab' },
  'commandPalette': { key: 'k', modifiers: ['mod'], description: 'Open command palette' },
  'search': { key: 'F', modifiers: ['mod', 'shift'], description: 'Search all notes' },
  'toggleSidebar': { key: '/', modifiers: ['mod'], description: 'Toggle sidebar' },
  'showShortcuts': { key: '?', modifiers: ['mod'], description: 'Show keyboard shortcuts' },
  'viewEditor': { key: '1', modifiers: ['mod'], description: 'Editor only view' },
  'viewSplit': { key: '2', modifiers: ['mod'], description: 'Split view' },
  'viewPreview': { key: '3', modifiers: ['mod'], description: 'Preview only view' },
  'bold': { key: 'b', modifiers: ['mod'], description: 'Bold text' },
  'italic': { key: 'i', modifiers: ['mod'], description: 'Italic text' },
  'link': { key: 'K', modifiers: ['mod', 'shift'], description: 'Insert link' },
  'codeBlock': { key: 'C', modifiers: ['mod', 'shift'], description: 'Insert code block' },
  'list': { key: 'L', modifiers: ['mod', 'shift'], description: 'Insert list' },
};

// Helper to apply theme to CSS variables
export const applyTheme = (themeId) => {
  const theme = THEMES.find(t => t.id === themeId);
  if (theme) {
    const { colors } = theme;
    document.documentElement.style.setProperty('--color-bg-base', colors.bgBase);
    document.documentElement.style.setProperty('--color-bg-sidebar', colors.bgSidebar);
    document.documentElement.style.setProperty('--color-bg-editor', colors.bgEditor);
    document.documentElement.style.setProperty('--color-overlay-bg', colors.overlayBg);
    document.documentElement.style.setProperty('--color-glass-border', colors.glassBorder);
    document.documentElement.style.setProperty('--color-glass-highlight', colors.glassHighlight);
    document.documentElement.style.setProperty('--color-glass-panel-bg', colors.glassPanelBg);
    document.documentElement.style.setProperty('--color-text-primary', colors.textPrimary);
    document.documentElement.style.setProperty('--color-text-secondary', colors.textSecondary);
    document.documentElement.style.setProperty('--color-text-muted', colors.textMuted);
    document.documentElement.style.setProperty('--color-border', colors.border);
    document.documentElement.style.setProperty('--color-border-light', colors.borderLight);
    document.documentElement.style.setProperty('--color-item-hover', colors.itemHover);
    document.documentElement.style.setProperty('--color-item-active', colors.itemActive);
    document.documentElement.style.setProperty('--color-titlebar-bg', colors.titlebarBg);

    // Set theme type attribute for conditional styling
    document.documentElement.setAttribute('data-theme', theme.type);
  }
};

// Helper to apply accent color to CSS variables
export const applyAccentColor = (colorId) => {
  const color = ACCENT_COLORS.find(c => c.id === colorId);
  if (color) {
    document.documentElement.style.setProperty('--color-accent', color.value);
    document.documentElement.style.setProperty('--color-accent-hover', color.hover);
    document.documentElement.style.setProperty('--color-accent-dim', `${color.value}1a`);
  }
};

// Helper to format keymap for display
export const formatKeymap = (keymap) => {
  const parts = [];
  if (keymap.modifiers.includes('mod')) {
    parts.push(navigator.platform.includes('Mac') ? '⌘' : 'Ctrl');
  }
  if (keymap.modifiers.includes('shift')) {
    parts.push('Shift');
  }
  if (keymap.modifiers.includes('alt')) {
    parts.push(navigator.platform.includes('Mac') ? '⌥' : 'Alt');
  }

  // Format the key nicely
  let keyDisplay = keymap.key;
  if (keymap.key === '/') keyDisplay = '/';
  else if (keymap.key === '?') keyDisplay = '?';
  else if (keymap.key.length === 1) keyDisplay = keymap.key.toUpperCase();

  parts.push(keyDisplay);
  return parts;
};

// Helper to check if a keyboard event matches a keymap
export const matchesKeymap = (event, keymap) => {
  const isMod = event.metaKey || event.ctrlKey;
  const isShift = event.shiftKey;
  const isAlt = event.altKey;

  const needsMod = keymap.modifiers.includes('mod');
  const needsShift = keymap.modifiers.includes('shift');
  const needsAlt = keymap.modifiers.includes('alt');

  if (needsMod !== isMod) return false;
  if (needsShift !== isShift) return false;
  if (needsAlt !== isAlt) return false;

  return event.key === keymap.key || event.key.toLowerCase() === keymap.key.toLowerCase();
};

const useSettingsStore = create(
  persist(
    (set, get) => ({
      // Theme
      themeId: 'midnight',

      // Accent color
      accentColorId: 'blue',

      // Editor settings
      vimMode: false,
      scrollSyncEnabled: true,

      // Keymaps (user customizations stored here)
      keymaps: { ...DEFAULT_KEYMAPS },

      // Recording state (not persisted)
      isRecordingKeymap: false,

      // Actions
      setTheme: (themeId) => {
        set({ themeId });
        applyTheme(themeId);
      },

      setAccentColor: (colorId) => {
        set({ accentColorId: colorId });
        applyAccentColor(colorId);
      },

      setVimMode: (enabled) => {
        set({ vimMode: enabled });
      },

      setScrollSyncEnabled: (enabled) => {
        set({ scrollSyncEnabled: enabled });
      },

      toggleScrollSync: () => {
        set((state) => ({ scrollSyncEnabled: !state.scrollSyncEnabled }));
      },

      toggleVimMode: () => {
        set((state) => ({ vimMode: !state.vimMode }));
      },

      setIsRecordingKeymap: (isRecording) => {
        set({ isRecordingKeymap: isRecording });
      },

      updateKeymap: (actionId, newKeymap) => {
        set((state) => ({
          keymaps: {
            ...state.keymaps,
            [actionId]: { ...state.keymaps[actionId], ...newKeymap }
          }
        }));
      },

      resetKeymaps: () => {
        set({ keymaps: { ...DEFAULT_KEYMAPS } });
      },

      resetKeymap: (actionId) => {
        set((state) => ({
          keymaps: {
            ...state.keymaps,
            [actionId]: { ...DEFAULT_KEYMAPS[actionId] }
          }
        }));
      },

      // Initialize settings (call on app start)
      initializeSettings: () => {
        const { themeId, accentColorId, keymaps } = get();

        // Merge any new default keymaps with existing user customizations
        const mergedKeymaps = { ...DEFAULT_KEYMAPS };
        Object.keys(keymaps).forEach(actionId => {
          if (DEFAULT_KEYMAPS[actionId]) {
            // Preserve user customizations
            mergedKeymaps[actionId] = keymaps[actionId];
          }
        });

        // Update if there are new keymaps
        if (Object.keys(mergedKeymaps).length !== Object.keys(keymaps).length) {
          set({ keymaps: mergedKeymaps });
        }

        applyTheme(themeId);
        applyAccentColor(accentColorId);
      },

      // Get keymap by action ID
      getKeymap: (actionId) => {
        return get().keymaps[actionId] || DEFAULT_KEYMAPS[actionId];
      },
    }),
    {
      name: 'marky-settings',
      partialize: (state) => ({
        themeId: state.themeId,
        accentColorId: state.accentColorId,
        vimMode: state.vimMode,
        scrollSyncEnabled: state.scrollSyncEnabled,
        keymaps: state.keymaps,
      }),
    }
  )
);

export default useSettingsStore;
