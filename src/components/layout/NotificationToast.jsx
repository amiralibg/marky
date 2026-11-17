import useUIStore from "../../store/uiStore";

const NotificationToast = () => {
  const { notifications, removeNotification } = useUIStore();

  return (
    // Frosted like every surface that floats above the sheet. The kind of
    // message is carried by the icon's colour alone — no tinted border or
    // fill, so a stack of toasts stays one quiet family.
    //
    // Clear of the sheet's status bar, which every editor view has (note,
    // HTML document, note window): the 8px desk gap under the sheet, the 36px
    // bar, then 16px of air — 60px. One place for every view, so a toast never
    // covers "Editing in place", Reload or the word count.
    <div className="fixed bottom-[60px] end-6 z-9999 flex flex-col gap-3 pointer-events-none">
      {notifications.map((n) => (
        <div
          key={n.id}
          className="glass-panel pointer-events-auto relative overflow-hidden flex flex-col rounded-card min-w-[300px] max-w-[440px] animate-fade-in"
        >
          <div className="flex items-center gap-3 ps-4 pe-2 py-2.5">
            <div
              className={`shrink-0 [&>svg]:h-[18px] [&>svg]:w-[18px] ${
                n.type === "error"
                  ? "text-red-500"
                  : n.type === "success"
                    ? "text-emerald-500"
                    : "text-blue-500"
              }`}
            >
              {n.type === "error" ? (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              ) : n.type === "success" ? (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}
            </div>

            <div className="flex-1 min-w-0">
              {n.title && (
                <div className="text-sm font-semibold text-text-primary truncate">{n.title}</div>
              )}
              <div className="text-[13px] font-medium text-text-primary">{n.message}</div>
            </div>

            {n.action && (
              <button
                onClick={() => {
                  n.action.callback();
                  removeNotification(n.id);
                }}
                className="h-7 px-3 text-[12.5px] font-semibold rounded-full text-accent hover:bg-accent-dim transition-colors"
              >
                {n.action.label}
              </button>
            )}

            <button
              onClick={() => removeNotification(n.id)}
              className="icon-btn"
              aria-label="Dismiss notification"
            >
              <svg
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          {typeof n.progress === "number" ? (
            <div className="px-4 pb-3">
              <div className="flex items-center justify-between text-[11px] text-text-muted mb-1">
                <span>{n.progressLabel || "Download progress"}</span>
                <span>{Math.round(n.progress)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-overlay-light overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, n.progress))}%` }}
                />
              </div>
            </div>
          ) : n.duration && n.duration !== Infinity ? (
            <div className="w-full h-0.5 bg-transparent">
              <div
                className={`h-full rounded-full ${
                  n.type === "error"
                    ? "bg-red-400/40"
                    : n.type === "success"
                      ? "bg-emerald-400/40"
                      : "bg-blue-400/40"
                }`}
                style={{
                  animation: `shrink-bar ${n.duration}ms linear forwards`,
                }}
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
};

export default NotificationToast;
