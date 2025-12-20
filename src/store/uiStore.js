import { create } from 'zustand';

const useUIStore = create((set) => ({
    notifications: [],

    addNotification: (message, type = 'info', duration = 3000) => {
        const id = Date.now();
        set((state) => ({
            notifications: [
                ...state.notifications,
                { id, message, type, duration }
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
