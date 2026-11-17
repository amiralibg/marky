import { create } from "zustand";

const useUIStore = create((set) => ({
  notifications: [],
  appUpdate: {
    status: "idle",
    update: null,
    version: null,
    message: "",
    progress: null,
    error: null,
  },
  focusMode: false,
  showWorkspaceModal: false,
  setShowWorkspaceModal: (value) => set({ showWorkspaceModal: value }),

  // One-shot requests the App layer listens for, so deeply-nested views
  // (e.g. the workspace dashboard) can open top-level modals.
  templateRequest: null,
  scheduleRequest: null,
  requestTemplateModal: (parentId = null) =>
    set({ templateRequest: { parentId, nonce: Date.now() } }),
  requestScheduleModal: (template = null) =>
    set({ scheduleRequest: { template, nonce: Date.now() } }),
  clearTemplateRequest: () => set({ templateRequest: null }),
  clearScheduleRequest: () => set({ scheduleRequest: null }),

  // The strip at the trailing end of the title bar. The editor portals its
  // own controls (Source/Live/Read and the ⋯ menu) into it, so they share the
  // tab row instead of costing the note a header row of its own.
  titlebarSlot: null,
  setTitlebarSlot: (element) => set({ titlebarSlot: element }),

  // The folder Home's Library is showing (`null` = the vault root). Held here
  // rather than in the dashboard so opening a note and coming back to Home
  // returns to the same folder; not persisted, since folder ids follow paths
  // and a stale one would only fall back to the root anyway.
  homeFolderId: null,
  setHomeFolderId: (folderId) => set({ homeFolderId: folderId ?? null }),

  toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),
  setFocusMode: (value) => set({ focusMode: value }),

  setAppUpdate: (patch) => {
    set((state) => ({
      appUpdate: {
        ...state.appUpdate,
        ...patch,
      },
    }));
  },

  resetAppUpdate: () => {
    set({
      appUpdate: {
        status: "idle",
        update: null,
        version: null,
        message: "",
        progress: null,
        error: null,
      },
    });
  },

  addNotification: (message, type = "info", duration = 3000, action = null, options = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    set((state) => ({
      notifications: [...state.notifications, { id, message, type, duration, action, ...options }],
    }));

    if (duration !== Infinity) {
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      }, duration);
    }

    return id;
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  updateNotification: (id, patch) => {
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));
  },

  clearAllNotifications: () => {
    set({ notifications: [] });
  },
}));

export default useUIStore;
