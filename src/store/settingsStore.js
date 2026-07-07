import { create } from "zustand";
import { persist } from "zustand/middleware";

// Theme definitions — "Vault" redesign (claude.ai/design Marky - Vault).
// bgEditor = the content "panel"; itemActive = "raised"; bar = skeleton bars
// in home-card / theme-card previews.
const defineTheme = (id, name, type, t) => ({
  id,
  name,
  type,
  preview: { bg: t.bg, sidebar: t.sidebar, accent: t.panel, bar: t.bar },
  colors: {
    bgBase: t.bg,
    bgSidebar: t.sidebar,
    bgEditor: t.panel,
    overlayBg: type === "light" ? "rgba(30, 25, 15, 0.38)" : "rgba(0, 0, 0, 0.5)",
    glassBorder: t.border,
    glassHighlight: t.hover,
    glassPanelBg: t.panel,
    textPrimary: t.text,
    textSecondary: t.text2,
    textMuted: t.text3,
    border: t.border,
    borderLight: t.borderLight,
    itemHover: t.hover,
    itemActive: t.raised,
    titlebarBg: t.sidebar,
    bar: t.bar,
  },
});

export const THEMES = [
  defineTheme("vault", "Vault", "light", {
    bg: "#ffffff",
    sidebar: "#f7f7f5",
    panel: "#ffffff",
    raised: "#fafaf9",
    border: "rgba(35, 35, 32, 0.09)",
    borderLight: "rgba(35, 35, 32, 0.16)",
    text: "#2f2f2b",
    text2: "#73726e",
    text3: "#9f9e9a",
    hover: "rgba(35, 35, 32, 0.045)",
    bar: "#e6e5e1",
  }),
  defineTheme("vault-dark", "Vault Dark", "dark", {
    bg: "#1e1e1c",
    sidebar: "#191918",
    panel: "#242422",
    raised: "#2b2b29",
    border: "rgba(240, 240, 235, 0.09)",
    borderLight: "rgba(240, 240, 235, 0.16)",
    text: "#e7e6e2",
    text2: "#a3a29d",
    text3: "#71706b",
    hover: "rgba(240, 240, 235, 0.05)",
    bar: "#4a4a46",
  }),
  defineTheme("paper", "Paper", "light", {
    bg: "#f6f3ec",
    sidebar: "#efeae0",
    panel: "#fffefb",
    raised: "#fffefb",
    border: "rgba(55, 50, 40, 0.11)",
    borderLight: "rgba(55, 50, 40, 0.2)",
    text: "#38352f",
    text2: "#75716a",
    text3: "#a39d92",
    hover: "rgba(55, 50, 40, 0.05)",
    bar: "#ddd6c8",
  }),
  defineTheme("paper-dark", "Paper Dark", "dark", {
    bg: "#1c1a16",
    sidebar: "#191713",
    panel: "#242019",
    raised: "#2b271f",
    border: "rgba(240, 232, 214, 0.10)",
    borderLight: "rgba(240, 232, 214, 0.18)",
    text: "#ece5d6",
    text2: "#a8a092",
    text3: "#756d5f",
    hover: "rgba(240, 232, 214, 0.05)",
    bar: "#524b3e",
  }),
  defineTheme("slate", "Slate", "dark", {
    bg: "#0e131c",
    sidebar: "#121a26",
    panel: "#16202e",
    raised: "#1d2a3c",
    border: "rgba(255, 255, 255, 0.08)",
    borderLight: "rgba(255, 255, 255, 0.14)",
    text: "#e6ecf5",
    text2: "#8ea0b8",
    text3: "#5d6e85",
    hover: "rgba(255, 255, 255, 0.05)",
    bar: "#46586e",
  }),
  defineTheme("midnight", "Midnight", "dark", {
    bg: "#0b0b0e",
    sidebar: "#121116",
    panel: "#17151d",
    raised: "#201e29",
    border: "rgba(255, 255, 255, 0.075)",
    borderLight: "rgba(255, 255, 255, 0.14)",
    text: "#ECECEF",
    text2: "#9b99a6",
    text3: "#6b6a77",
    hover: "rgba(255, 255, 255, 0.05)",
    bar: "#5b5766",
  }),
  defineTheme("gruvbox-light", "Gruvbox Light", "light", {
    bg: "#f2e5bc",
    sidebar: "#ebdbb2",
    panel: "#fbf1c7",
    raised: "#fbf1c7",
    border: "rgba(60, 56, 54, 0.12)",
    borderLight: "rgba(60, 56, 54, 0.2)",
    text: "#3c3836",
    text2: "#665c54",
    text3: "#928374",
    hover: "rgba(60, 56, 54, 0.05)",
    bar: "#d5c4a1",
  }),
  defineTheme("gruvbox-dark", "Gruvbox Dark", "dark", {
    bg: "#282828",
    sidebar: "#1d2021",
    panel: "#32302f",
    raised: "#3c3836",
    border: "rgba(235, 219, 178, 0.10)",
    borderLight: "rgba(235, 219, 178, 0.18)",
    text: "#ebdbb2",
    text2: "#a89984",
    text3: "#7c6f64",
    hover: "rgba(235, 219, 178, 0.05)",
    bar: "#665c54",
  }),
];

// Predefined accent colors (Vault palette; purple is the default)
export const ACCENT_COLORS = [
  { id: "purple", name: "Purple", value: "#6d5ce0", hover: "#5b4ad0" },
  { id: "blue", name: "Blue", value: "#3b6fd0", hover: "#2f5db8" },
  { id: "pink", name: "Pink", value: "#d65b9a", hover: "#c34787" },
  { id: "red", name: "Red", value: "#d35450", hover: "#bf413d" },
  { id: "orange", name: "Orange", value: "#d57a32", hover: "#c16a24" },
  { id: "green", name: "Green", value: "#4f9d69", hover: "#3f8a58" },
];

// Light ↔ dark counterparts for the sidebar mode toggle. Dark-only themes
// (slate, midnight) fall back to vault when switching to light.
export const THEME_COUNTERPARTS = {
  vault: "vault-dark",
  "vault-dark": "vault",
  paper: "paper-dark",
  "paper-dark": "paper",
  "gruvbox-light": "gruvbox-dark",
  "gruvbox-dark": "gruvbox-light",
  slate: "vault",
  midnight: "vault",
};

// Persisted ids from earlier designs → Vault equivalents
const LEGACY_THEME_IDS = { light: "vault", charcoal: "vault-dark" };
const LEGACY_ACCENT_IDS = {
  violet: "purple",
  amber: "orange",
  teal: "green",
  cyan: "blue",
};
const migrateThemeId = (id) => LEGACY_THEME_IDS[id] || id;
const migrateAccentId = (id) => LEGACY_ACCENT_IDS[id] || id;

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
  const theme = THEMES.find((t) => t.id === migrateThemeId(themeId));
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
    document.documentElement.style.setProperty("--color-bar", colors.bar);

    // Set theme type attribute for conditional styling
    document.documentElement.setAttribute("data-theme", theme.type);
  }
};

// hex "#rrggbb" → "rgba(r,g,b,a)" — used for the soft accent wash
const hexToRgba = (hex, alpha) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

// Helper to apply accent color to CSS variables
export const applyAccentColor = (colorId) => {
  const color = ACCENT_COLORS.find((c) => c.id === migrateAccentId(colorId));
  if (color) {
    document.documentElement.style.setProperty("--color-accent", color.value);
    document.documentElement.style.setProperty("--color-accent-hover", color.hover);
    document.documentElement.style.setProperty("--color-accent-dim", hexToRgba(color.value, 0.16));
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
  themeId: "vault",
  accentColorId: "purple",
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

const mergeProfileSettings = (profile = {}) => {
  const merged = {
    ...createDefaultProfileSettings(),
    ...profile,
    keymaps: { ...DEFAULT_KEYMAPS, ...migrateLegacyKeymaps(profile?.keymaps || {}) },
  };
  merged.themeId = migrateThemeId(merged.themeId);
  merged.accentColorId = migrateAccentId(merged.accentColorId);
  if (!THEMES.some((t) => t.id === merged.themeId)) merged.themeId = "vault";
  if (!ACCENT_COLORS.some((c) => c.id === merged.accentColorId)) merged.accentColorId = "purple";
  return merged;
};

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
      themeId: "vault",

      // Accent color
      accentColorId: "purple",

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

      toggleColorScheme: () => {
        const current = migrateThemeId(get().themeId);
        const next = THEME_COUNTERPARTS[current] || "vault";
        get().setTheme(next);
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
