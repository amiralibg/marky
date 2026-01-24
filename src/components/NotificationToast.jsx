import React from 'react';
import useUIStore from '../store/uiStore';

const NotificationToast = () => {
    const { notifications, removeNotification } = useUIStore();

    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
            {notifications.map((n) => (
                <div
                    key={n.id}
                    className={`
            pointer-events-auto
            flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border min-w-[300px]
            glass-panel animate-in slide-in-from-right-full duration-300
            ${n.type === 'error' ? 'border-red-500/30 bg-red-500/5' :
                            n.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/5' :
                                'border-blue-500/30 bg-blue-500/5'}
          `}
                >
                    <div className={`p-2 rounded-lg ${n.type === 'error' ? 'bg-red-500/10 text-red-400' :
                            n.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                                'bg-blue-500/10 text-blue-400'
                        }`}>
                        {n.type === 'error' ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        ) : n.type === 'success' ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        )}
                    </div>

                    <div className="flex-1 text-sm font-medium text-text-primary">
                        {n.message}
                    </div>

                    <button
                        onClick={() => removeNotification(n.id)}
                        className="p-1 hover:bg-overlay-light rounded-md text-text-muted hover:text-text-primary transition-all"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            ))}
        </div>
    );
};

export default NotificationToast;
