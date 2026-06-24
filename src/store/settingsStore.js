import { create } from "zustand";
import { persist } from "zustand/middleware";

// Theme definitions — "Paper / Midnight" redesign. Warm, calm, content-first
// (Notion as north star). bgEditor = the content "panel"; itemActive = "raised".
export const THEMES = [
  {
    id: "paper",
    name: "Paper",
    type: "light",
    preview: { bg: "#f5f2ea", sidebar: "#ece8dd", accent: "#fffdf7" },
    colors: {
      bgBase: "#f5f2ea",
      bgSidebar: "#ece8dd",
      bgEditor: "#fffdf7",
      overlayBg: "rgba(245, 242, 234, 0.8)",
      glassBorder: "rgba(70, 60, 40, 0.12)",
      glassHighlight: "rgba(70, 60, 40, 0.03)",
      glassPanelBg: "#fffdf7",
      textPrimary: "#2c2a26",
      textSecondary: "#6f6a60",
      textMuted: "#9c968a",
      border: "rgba(70, 60, 40, 0.12)",
      borderLight: "rgba(70, 60, 40, 0.2)",
      itemHover: "rgba(70, 60, 40, 0.05)",
      itemActive: "rgba(70, 60, 40, 0.09)",
      titlebarBg: "#ece8dd",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    type: "dark",
    preview: { bg: "#0b0b0e", sidebar: "#121116", accent: "#201e29" },
    colors: {
      bgBase: "#0b0b0e",
      bgSidebar: "#121116",
      bgEditor: "#17151d",
      overlayBg: "rgba(11, 11, 14, 0.8)",
      glassBorder: "rgba(255, 255, 255, 0.075)",
      glassHighlight: "rgba(255, 255, 255, 0.03)",
      glassPanelBg: "rgba(23, 21, 29, 0.85)",
      textPrimary: "#ECECEF",
      textSecondary: "#9b99a6",
      textMuted: "#6b6a77",
      border: "rgba(255, 255, 255, 0.075)",
      borderLight: "rgba(255, 255, 255, 0.14)",
      itemHover: "rgba(255, 255, 255, 0.05)",
      itemActive: "#201e29",
      titlebarBg: "#0b0b0e",
    },
  },
  {
    id: "charcoal",
    name: "Charcoal",
    type: "dark",
    preview: { bg: "#1a1a1a", sidebar: "#202020", accent: "#2e2e2e" },
    colors: {
      bgBase: "#1a1a1a",
      bgSidebar: "#202020",
      bgEditor: "#262626",
      overlayBg: "rgba(26, 26, 26, 0.85)",
      glassBorder: "rgba(255, 255, 255, 0.08)",
      glassHighlight: "rgba(255, 255, 255, 0.04)",
      glassPanelBg: "rgba(38, 38, 38, 0.85)",
      textPrimary: "#e8e8e8",
      textSecondary: "#a0a0a0",
      textMuted: "#6e6e6e",
      border: "rgba(255, 255, 255, 0.08)",
      borderLight: "rgba(255, 255, 255, 0.14)",
      itemHover: "rgba(255, 255, 255, 0.05)",
      itemActive: "#2e2e2e",
      titlebarBg: "#1a1a1a",
    },
  },
  {
    id: "slate",
    name: "Slate",
    type: "dark",
    preview: { bg: "#0e131c", sidebar: "#121a26", accent: "#1d2a3c" },
    colors: {
      bgBase: "#0e131c",
      bgSidebar: "#121a26",
      bgEditor: "#16202e",
      overlayBg: "rgba(14, 19, 28, 0.85)",
      glassBorder: "rgba(255, 255, 255, 0.07)",
      glassHighlight: "rgba(255, 255, 255, 0.04)",
      glassPanelBg: "rgba(22, 32, 46, 0.85)",
      textPrimary: "#e6ecf5",
      textSecondary: "#8ea0b8",
      textMuted: "#5d6e85",
      border: "rgba(255, 255, 255, 0.07)",
      borderLight: "rgba(255, 255, 255, 0.13)",
      itemHover: "rgba(255, 255, 255, 0.05)",
      itemActive: "#1d2a3c",
      titlebarBg: "#0e131c",
    },
  },
  {
    id: "light",
    name: "Snow",
    type: "light",
    preview: { bg: "#f7f7f5", sidebar: "#efeeec", accent: "#ffffff" },
    colors: {
      bgBase: "#f7f7f5",
      bgSidebar: "#efeeec",
      bgEditor: "#ffffff",
      overlayBg: "rgba(247, 247, 245, 0.9)",
      glassBorder: "rgba(20, 20, 20, 0.09)",
      glassHighlight: "rgba(20, 20, 20, 0.02)",
      glassPanelBg: "#ffffff",
      textPrimary: "#1f1f1d",
      textSecondary: "#6b6a66",
      textMuted: "#9a9893",
      border: "rgba(20, 20, 20, 0.09)",
      borderLight: "rgba(20, 20, 20, 0.16)",
      itemHover: "rgba(20, 20, 20, 0.04)",
      itemActive: "rgba(20, 20, 20, 0.07)",
      titlebarBg: "#efeeec",
    },
  },
  {
    id: "gruvbox-dark",
    name: "Gruvbox Dark",
    type: "dark",
    preview: { bg: "#282828", sidebar: "#1d2021", accent: "#3c3836" },
    colors: {
      bgBase: "#282828",
      bgSidebar: "#1d2021",
      bgEditor: "#32302f",
      overlayBg: "rgba(40, 40, 40, 0.85)",
      glassBorder: "rgba(235, 219, 178, 0.1)",
      glassHighlight: "rgba(235, 219, 178, 0.04)",
      glassPanelBg: "rgba(60, 56, 54, 0.85)",
      textPrimary: "#ebdbb2",
      textSecondary: "#a89984",
      textMuted: "#7c6f64",
      border: "rgba(235, 219, 178, 0.1)",
      borderLight: "rgba(235, 219, 178, 0.18)",
      itemHover: "rgba(235, 219, 178, 0.05)",
      itemActive: "#3c3836",
      titlebarBg: "#282828",
    },
  },
  {
    id: "gruvbox-light",
    name: "Gruvbox Light",
    type: "light",
    preview: { bg: "#f2e5bc", sidebar: "#ebdbb2", accent: "#fbf1c7" },
    colors: {
      bgBase: "#f2e5bc",
      bgSidebar: "#ebdbb2",
      bgEditor: "#fbf1c7",
      overlayBg: "rgba(242, 229, 188, 0.9)",
      glassBorder: "rgba(60, 56, 54, 0.12)",
      glassHighlight: "rgba(60, 56, 54, 0.03)",
      glassPanelBg: "#fbf1c7",
      textPrimary: "#3c3836",
      textSecondary: "#665c54",
      textMuted: "#928374",
      border: "rgba(60, 56, 54, 0.12)",
      borderLight: "rgba(60, 56, 54, 0.2)",
      itemHover: "rgba(60, 56, 54, 0.05)",
      itemActive: "rgba(60, 56, 54, 0.09)",
      titlebarBg: "#ebdbb2",
    },
  },
];

// Predefined accent colors (violet is the Paper default)
export const ACCENT_COLORS = [
  { id: "violet", name: "Violet", value: "#6f56d8", hover: "#5d46c4" },
  { id: "purple", name: "Purple", value: "#8b5cf6", hover: "#7c3aed" },
  { id: "blue", name: "Blue", value: "#3b82f6", hover: "#2563eb" },
  { id: "pink", name: "Pink", value: "#ec4899", hover: "#db2777" },
  { id: "red", name: "Red", value: "#ef4444", hover: "#dc2626" },
  { id: "orange", name: "Orange", value: "#f97316", hover: "#ea580c" },
  { id: "amber", name: "Amber", value: "#f59e0b", hover: "#d97706" },
  { id: "green", name: "Green", value: "#22c55e", hover: "#16a34a" },
  { id: "teal", name: "Teal", value: "#14b8a6", hover: "#0d9488" },
  { id: "cyan", name: "Cyan", value: "#06b6d4", hover: "#0891b2" },
];

// Default keymaps configuration
export const DEFAULT_KEYMAPS = {
  newNote: { key: "n", modifiers: ["mod"], description: "Create new note" },
  newFolder: { key: "N", modifiers: ["mod", "shift"], description: "Create new folder" },
  openFolder: { key: "o", modifiers: ["mod"], description: "Open folder" },
  save: { key: "s", modifiers: ["mod"], description: "Save current note" },
  closeTab: { key: "w", modifiers: ["mod"], description: "Close current tab" },
  commandPalette: { key: "k", modifiers: ["mod"], description: "Open command palette" },
  search: { key: "F", modifiers: ["mod", "shift"], description: "Search all notes" },
  editorSearch: { key: "f", modifiers: ["mod"], description: "Find in editor" },
  toggleSidebar: { key: "b", modifiers: ["mod"], description: "Toggle sidebar" },
  showShortcuts: { key: "/", modifiers: ["mod"], description: "Show keyboard shortcuts" },
  viewEditor: { key: "1", modifiers: ["mod"], description: "Editor only view" },
  viewSplit: { key: "2", modifiers: ["mod"], description: "Split view" },
  viewPreview: { key: "3", modifiers: ["mod"], description: "Preview only view" },
  toggleFocusMode: { key: "F", modifiers: ["mod", "alt"], description: "Toggle Focus Mode" },
  bold: { key: "B", modifiers: ["mod", "shift"], description: "Bold text" },
  italic: { key: "i", modifiers: ["mod"], description: "Italic text" },
  link: { key: "K", modifiers: ["mod", "shift"], description: "Insert link" },
  codeBlock: { key: "C", modifiers: ["mod", "shift"], description: "Insert code block" },
  list: { key: "L", modifiers: ["mod", "shift"], description: "Insert list" },
};

const LEGACY_DEFAULT_KEYMAPS = {
  toggleSidebar: { key: "/", modifiers: ["mod"] },
  bold: { key: "b", modifiers: ["mod"] },
};

const areKeymapsEqual = (left, right) =>
  left?.key === right?.key &&
  JSON.stringify(left?.modifiers || []) === JSON.stringify(right?.modifiers || []);

const migrateLegacyKeymaps = (keymaps = {}) => {
  const nextKeymaps = { ...keymaps };
  const usesLegacySidebarDefault = areKeymapsEqual(
    nextKeymaps.toggleSidebar,
    LEGACY_DEFAULT_KEYMAPS.toggleSidebar
  );
  const usesLegacyBoldDefault = areKeymapsEqual(nextKeymaps.bold, LEGACY_DEFAULT_KEYMAPS.bold);

  if (usesLegacySidebarDefault) {
    nextKeymaps.toggleSidebar = { ...DEFAULT_KEYMAPS.toggleSidebar };

    if (usesLegacyBoldDefault) {
      nextKeymaps.bold = { ...DEFAULT_KEYMAPS.bold };
    }
  }

  return nextKeymaps;
};

// Centralized keymap category definitions (icons + action groupings)
// Used by KeymapsModal and KeymapsSettings to render shortcuts consistently
export const KEYMAP_CATEGORIES = [
  {
    name: "File Operations",
    iconPath: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z",
    actions: ["newNote", "newFolder", "openFolder", "save"],
  },
  {
    name: "Navigation",
    iconPath: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    actions: ["commandPalette", "search", "toggleSidebar"],
  },
  {
    name: "View",
    iconPath:
      "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z",
    actions: ["viewEditor", "viewSplit", "viewPreview", "toggleFocusMode"],
  },
  {
    name: "Editing",
    iconPath:
      "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    actions: ["editorSearch", "bold", "italic", "link", "codeBlock", "list"],
  },
  {
    name: "Help",
    iconPath:
      "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    actions: ["showShortcuts"],
  },
];

// Helper to apply theme to CSS variables
export const applyTheme = (themeId) => {
  const theme = THEMES.find((t) => t.id === themeId);
  if (theme) {
    const { colors } = theme;
    document.documentElement.style.setProperty("--color-bg-base", colors.bgBase);
    document.documentElement.style.setProperty("--color-bg-sidebar", colors.bgSidebar);
    document.documentElement.style.setProperty("--color-bg-editor", colors.bgEditor);
    document.documentElement.style.setProperty("--color-overlay-bg", colors.overlayBg);
    document.documentElement.style.setProperty("--color-glass-border", colors.glassBorder);
    document.documentElement.style.setProperty("--color-glass-highlight", colors.glassHighlight);
    document.documentElement.style.setProperty("--color-glass-panel-bg", colors.glassPanelBg);
    document.documentElement.style.setProperty("--color-text-primary", colors.textPrimary);
    document.documentElement.style.setProperty("--color-text-secondary", colors.textSecondary);
    document.documentElement.style.setProperty("--color-text-muted", colors.textMuted);
    document.documentElement.style.setProperty("--color-border", colors.border);
    document.documentElement.style.setProperty("--color-border-light", colors.borderLight);
    document.documentElement.style.setProperty("--color-item-hover", colors.itemHover);
    document.documentElement.style.setProperty("--color-item-active", colors.itemActive);
    document.documentElement.style.setProperty("--color-titlebar-bg", colors.titlebarBg);

    // Set theme type attribute for conditional styling
    document.documentElement.setAttribute("data-theme", theme.type);
  }
};

// Helper to apply accent color to CSS variables
export const applyAccentColor = (colorId) => {
  const color = ACCENT_COLORS.find((c) => c.id === colorId);
  if (color) {
    document.documentElement.style.setProperty("--color-accent", color.value);
    document.documentElement.style.setProperty("--color-accent-hover", color.hover);
    document.documentElement.style.setProperty("--color-accent-dim", `${color.value}24`);
  }
};

// Helper to format keymap for display
export const formatKeymap = (keymap) => {
  const parts = [];
  if (keymap.modifiers.includes("mod")) {
    parts.push(navigator.platform.includes("Mac") ? "⌘" : "Ctrl");
  }
  if (keymap.modifiers.includes("shift")) {
    parts.push("Shift");
  }
  if (keymap.modifiers.includes("alt")) {
    parts.push(navigator.platform.includes("Mac") ? "⌥" : "Alt");
  }

  // Format the key nicely
  let keyDisplay = keymap.key;
  if (keymap.key === "/") keyDisplay = "/";
  else if (keymap.key === "?") keyDisplay = "?";
  else if (keymap.key.length === 1) keyDisplay = keymap.key.toUpperCase();

  parts.push(keyDisplay);
  return parts;
};

const normalizeWorkspacePath = (value) => (value ? value.replace(/\\/g, "/") : "");

const createDefaultProfileSettings = () => ({
  themeId: "paper",
  accentColorId: "violet",
  vimMode: false,
  scrollSyncEnabled: true,
  autosaveEnabled: false,
  autosaveDelay: 2000,
  typewriterMode: false,
  sidebarDensity: "comfortable",
  showSidebarMetadata: true,
  keymaps: { ...DEFAULT_KEYMAPS },
});

const buildProfileSettingsSnapshot = (state) => ({
  themeId: state.themeId,
  accentColorId: state.accentColorId,
  vimMode: state.vimMode,
  scrollSyncEnabled: state.scrollSyncEnabled,
  autosaveEnabled: state.autosaveEnabled,
  autosaveDelay: state.autosaveDelay,
  typewriterMode: state.typewriterMode,
  sidebarDensity: state.sidebarDensity,
  showSidebarMetadata: state.showSidebarMetadata,
  keymaps: { ...DEFAULT_KEYMAPS, ...(state.keymaps || {}) },
});

const mergeProfileSettings = (profile = {}) => ({
  ...createDefaultProfileSettings(),
  ...profile,
  keymaps: { ...DEFAULT_KEYMAPS, ...migrateLegacyKeymaps(profile?.keymaps || {}) },
});

// Helper to check if a keyboard event matches a keymap
export const matchesKeymap = (event, keymap) => {
  const isMod = event.metaKey || event.ctrlKey;
  const isShift = event.shiftKey;
  const isAlt = event.altKey;

  const needsMod = keymap.modifiers.includes("mod");
  const needsShift = keymap.modifiers.includes("shift");
  const needsAlt = keymap.modifiers.includes("alt");

  if (needsMod !== isMod) return false;
  if (needsShift !== isShift) return false;
  if (needsAlt !== isAlt) return false;

  return event.key === keymap.key || event.key.toLowerCase() === keymap.key.toLowerCase();
};

const useSettingsStore = create(
  persist(
    (set, get) => ({
      // Theme
      themeId: "paper",

      // Accent color
      accentColorId: "violet",

      // Editor settings
      vimMode: false,
      scrollSyncEnabled: true,
      autosaveEnabled: false,
      autosaveDelay: 2000, // ms after last keystroke to auto-save
      typewriterMode: false,
      sidebarDensity: "comfortable", // 'compact' | 'comfortable' | 'spacious'
      showSidebarMetadata: true,
      openRecentOnStartup: true,

      // Keymaps (user customizations stored here)
      keymaps: { ...DEFAULT_KEYMAPS },

      // Shared settings are used when a workspace has no dedicated profile
      sharedSettings: createDefaultProfileSettings(),
      workspaceProfiles: {},
      activeWorkspacePath: null,

      // Recording state (not persisted)
      isRecordingKeymap: false,

      syncProfileState: (updater) => {
        set((state) => {
          const updates = typeof updater === "function" ? updater(state) : updater;
          if (!updates || typeof updates !== "object") {
            return {};
          }

          const previewState = { ...state, ...updates };
          const snapshot = buildProfileSettingsSnapshot(previewState);
          const activeWorkspacePath = normalizeWorkspacePath(state.activeWorkspacePath);
          const hasWorkspaceProfile =
            activeWorkspacePath && state.workspaceProfiles[activeWorkspacePath];

          return {
            ...updates,
            ...(hasWorkspaceProfile
              ? {
                  workspaceProfiles: {
                    ...state.workspaceProfiles,
                    [activeWorkspacePath]: snapshot,
                  },
                }
              : {
                  sharedSettings: snapshot,
                }),
          };
        });
      },

      // Actions
      setTheme: (themeId) => {
        get().syncProfileState({ themeId });
        applyTheme(themeId);
      },

      setAccentColor: (colorId) => {
        get().syncProfileState({ accentColorId: colorId });
        applyAccentColor(colorId);
      },

      setVimMode: (enabled) => {
        get().syncProfileState({ vimMode: enabled });
      },

      setAutosaveEnabled: (enabled) => {
        get().syncProfileState({ autosaveEnabled: enabled });
      },
      setAutosaveDelay: (delay) => {
        get().syncProfileState({ autosaveDelay: delay });
      },
      setTypewriterMode: (enabled) => {
        get().syncProfileState({ typewriterMode: enabled });
      },
      setSidebarDensity: (density) => {
        get().syncProfileState({ sidebarDensity: density });
      },
      setShowSidebarMetadata: (enabled) => {
        get().syncProfileState({ showSidebarMetadata: enabled });
      },
      setOpenRecentOnStartup: (enabled) => {
        set({ openRecentOnStartup: enabled });
      },

      setScrollSyncEnabled: (enabled) => {
        get().syncProfileState({ scrollSyncEnabled: enabled });
      },

      toggleScrollSync: () => {
        get().syncProfileState((state) => ({ scrollSyncEnabled: !state.scrollSyncEnabled }));
      },

      toggleVimMode: () => {
        get().syncProfileState((state) => ({ vimMode: !state.vimMode }));
      },

      setIsRecordingKeymap: (isRecording) => {
        set({ isRecordingKeymap: isRecording });
      },

      updateKeymap: (actionId, newKeymap) => {
        get().syncProfileState((state) => ({
          keymaps: {
            ...state.keymaps,
            [actionId]: { ...state.keymaps[actionId], ...newKeymap },
          },
        }));
      },

      resetKeymaps: () => {
        get().syncProfileState({ keymaps: { ...DEFAULT_KEYMAPS } });
      },

      resetKeymap: (actionId) => {
        get().syncProfileState((state) => ({
          keymaps: {
            ...state.keymaps,
            [actionId]: { ...DEFAULT_KEYMAPS[actionId] },
          },
        }));
      },

      hasWorkspaceSettingsProfile: (workspacePath) => {
        const normalizedPath = normalizeWorkspacePath(workspacePath);
        if (!normalizedPath) return false;
        return Boolean(get().workspaceProfiles[normalizedPath]);
      },

      setWorkspaceSettingsEnabled: (workspacePath, enabled) => {
        const normalizedPath = normalizeWorkspacePath(workspacePath);
        if (!normalizedPath) return;

        if (enabled) {
          set((state) => ({
            workspaceProfiles: {
              ...state.workspaceProfiles,
              [normalizedPath]: state.workspaceProfiles[normalizedPath]
                ? mergeProfileSettings(state.workspaceProfiles[normalizedPath])
                : buildProfileSettingsSnapshot(state),
            },
          }));

          get().syncWorkspaceSettings(normalizedPath);
          return;
        }

        const state = get();
        const nextProfiles = { ...state.workspaceProfiles };
        delete nextProfiles[normalizedPath];

        const shouldApplySharedSettings =
          normalizeWorkspacePath(state.activeWorkspacePath) === normalizedPath;
        const sharedSettings = mergeProfileSettings(state.sharedSettings);

        set({
          workspaceProfiles: nextProfiles,
          ...(shouldApplySharedSettings
            ? {
                ...sharedSettings,
                activeWorkspacePath: normalizedPath,
              }
            : {}),
        });

        if (shouldApplySharedSettings) {
          applyTheme(sharedSettings.themeId);
          applyAccentColor(sharedSettings.accentColorId);
        }
      },

      syncWorkspaceSettings: (workspacePath) => {
        const normalizedPath = normalizeWorkspacePath(workspacePath);
        const state = get();
        const sharedSettings = mergeProfileSettings(state.sharedSettings);
        const workspaceSettings = normalizedPath ? state.workspaceProfiles[normalizedPath] : null;
        const snapshot = mergeProfileSettings(workspaceSettings || sharedSettings);

        set({
          ...snapshot,
          sharedSettings,
          activeWorkspacePath: normalizedPath || null,
        });

        applyTheme(snapshot.themeId);
        applyAccentColor(snapshot.accentColorId);
      },

      clearActiveWorkspaceSettings: () => {
        const sharedSettings = mergeProfileSettings(get().sharedSettings);
        set({
          ...sharedSettings,
          activeWorkspacePath: null,
        });
        applyTheme(sharedSettings.themeId);
        applyAccentColor(sharedSettings.accentColorId);
      },

      getSettingsExportPayload: () => {
        const state = get();
        const sharedSettings = mergeProfileSettings(state.sharedSettings);
        const workspaceProfiles = Object.fromEntries(
          Object.entries(state.workspaceProfiles || {}).map(([path, profile]) => [
            normalizeWorkspacePath(path),
            mergeProfileSettings(profile),
          ])
        );

        return {
          version: 2,
          ...sharedSettings,
          openRecentOnStartup: state.openRecentOnStartup,
          sharedSettings,
          workspaceProfiles,
        };
      },

      importSettingsPayload: (payload = {}) => {
        const currentState = get();
        const sharedSettings = mergeProfileSettings(
          payload.sharedSettings && typeof payload.sharedSettings === "object"
            ? payload.sharedSettings
            : payload
        );
        const workspaceProfiles = Object.fromEntries(
          Object.entries(payload.workspaceProfiles || {}).map(([path, profile]) => [
            normalizeWorkspacePath(path),
            mergeProfileSettings(profile),
          ])
        );
        const activeWorkspacePath = normalizeWorkspacePath(currentState.activeWorkspacePath);
        const activeSnapshot =
          activeWorkspacePath && workspaceProfiles[activeWorkspacePath]
            ? workspaceProfiles[activeWorkspacePath]
            : sharedSettings;

        set({
          ...activeSnapshot,
          sharedSettings,
          workspaceProfiles,
          openRecentOnStartup:
            typeof payload.openRecentOnStartup === "boolean"
              ? payload.openRecentOnStartup
              : currentState.openRecentOnStartup,
        });

        applyTheme(activeSnapshot.themeId);
        applyAccentColor(activeSnapshot.accentColorId);
      },

      // Initialize settings (call on app start)
      initializeSettings: () => {
        const state = get();
        const sharedSettings = mergeProfileSettings(
          state.sharedSettings || buildProfileSettingsSnapshot(state)
        );
        const workspaceProfiles = Object.fromEntries(
          Object.entries(state.workspaceProfiles || {}).map(([path, profile]) => [
            normalizeWorkspacePath(path),
            mergeProfileSettings(profile),
          ])
        );
        const activeWorkspacePath = normalizeWorkspacePath(state.activeWorkspacePath);
        const snapshot =
          activeWorkspacePath && workspaceProfiles[activeWorkspacePath]
            ? workspaceProfiles[activeWorkspacePath]
            : sharedSettings;

        set({
          ...snapshot,
          sharedSettings,
          workspaceProfiles,
          activeWorkspacePath: activeWorkspacePath || null,
        });

        applyTheme(snapshot.themeId);
        applyAccentColor(snapshot.accentColorId);
      },

      // Get keymap by action ID
      getKeymap: (actionId) => {
        return get().keymaps[actionId] || DEFAULT_KEYMAPS[actionId];
      },
    }),
    {
      name: "marky-settings",
      partialize: (state) => ({
        themeId: state.themeId,
        accentColorId: state.accentColorId,
        vimMode: state.vimMode,
        scrollSyncEnabled: state.scrollSyncEnabled,
        autosaveEnabled: state.autosaveEnabled,
        autosaveDelay: state.autosaveDelay,
        typewriterMode: state.typewriterMode,
        sidebarDensity: state.sidebarDensity,
        showSidebarMetadata: state.showSidebarMetadata,
        keymaps: state.keymaps,
        openRecentOnStartup: state.openRecentOnStartup,
        sharedSettings: state.sharedSettings,
        workspaceProfiles: state.workspaceProfiles,
        activeWorkspacePath: state.activeWorkspacePath,
      }),
    }
  )
);

if (typeof window !== "undefined") {
  window.__markySettings = useSettingsStore;
}

export default useSettingsStore;
