import { create } from 'zustand';

const useUIStore = create((set) => ({
    notifications: [],
    focusMode: false,
    showWorkspaceModal: false,
    setShowWorkspaceModal: (value) => set({ showWorkspaceModal: value }),

    toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),
    setFocusMode: (value) => set({ focusMode: value }),

    addNotification: (message, type = 'info', duration = 3000, action = null) => {
        const id = Date.now();
        set((state) => ({
            notifications: [
                ...state.notifications,
                { id, message, type, duration, action }
            ]
        }));

        if (duration !== Infinity) {
            setTimeout(() => {
                set((state) => ({
                    notifications: state.notifications.filter((n) => n.id !== id)
                }));
            }, duration);
        }

        return id;
    },

    removeNotification: (id) => {
        set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== id)
        }));
    },

    clearAllNotifications: () => {
        set({ notifications: [] });
    }
}));

export default useUIStore;
