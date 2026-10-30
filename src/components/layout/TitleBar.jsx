import { useRef, useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import useNotesStore, { SETTINGS_TAB_ID } from "../../store/notesStore";
import useSettingsStore, { formatKeymap } from "../../store/settingsStore";
import useUIStore from "../../store/uiStore";
import { SidebarIcon } from "../icons";
import { detectPlatform } from "../../utils/platform";

const TitleBar = ({
  sidebarWidth,
  showSidebar,
  onNewNote,
  onNewFolder,
  onToggleSidebar,
  onCloseTab,
}) => {
  const openNoteIds = useNotesStore((state) => state.openNoteIds);
  const currentNoteId = useNotesStore((state) => state.currentNoteId);
  const selectNote = useNotesStore((state) => state.selectNote);
  const closeNote = useNotesStore((state) => state.closeNote);
  const items = useNotesStore((state) => state.items);
  const getKeymap = useSettingsStore((state) => state.getKeymap);
  const setTitlebarSlot = useUIStore((state) => state.setTitlebarSlot);
  const sidebarShortcut = formatKeymap(getKeymap("toggleSidebar")).join("");
  const scrollRef = useRef(null);
  const [platform, setPlatform] = useState(detectPlatform);
  const [isMaximized, setIsMaximized] = useState(false);

  // getCurrentWindow throws without the Tauri runtime; fall back to a no-op
  // controller so the UI still renders (e.g. in a plain browser preview).
  const windowControls = useMemo(() => {
    try {
      return getCurrentWindow();
    } catch {
      const noop = () => Promise.resolve();
      return {
        isMaximized: noop,
        onResized: () => Promise.resolve(() => {}),
        toggleMaximize: noop,
        startDragging: noop,
        minimize: noop,
        close: noop,
      };
    }
  }, []);
  const isMac = platform === "macos";
  const isWindows = platform === "windows";
  const isLinux = platform === "linux";

  const openNotes = openNoteIds
    .map((id) => {
      // Handle special settings tab
      if (id === SETTINGS_TAB_ID) {
        return {
          id: SETTINGS_TAB_ID,
          name: "Settings",
          isSpecial: true,
        };
      }
      return items.find((item) => item.id === id);
    })
    .filter(Boolean);

  useEffect(() => {
    let unlistenResize;

    setPlatform(detectPlatform());
    windowControls
      .isMaximized()
      .then(setIsMaximized)
      .catch(() => {});
    windowControls
      .onResized(() => {
        windowControls
          .isMaximized()
          .then(setIsMaximized)
          .catch(() => {});
      })
      .then((unlisten) => {
        unlistenResize = unlisten;
      })
      .catch(() => {});

    return () => unlistenResize?.();
  }, [windowControls]);

  useEffect(() => {
    const activeTab = scrollRef.current?.querySelector(".active-tab");
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [currentNoteId]);

  const handleMouseDown = async (e) => {
    // Only handle left mouse button
    if (e.buttons !== 1) return;

    // Don't drag if clicking on interactive elements
    if (e.target.closest("button, input, [data-no-drag]")) return;

    if (e.detail === 2) {
      // Double click to maximize/restore
      await windowControls.toggleMaximize();
      setIsMaximized(await windowControls.isMaximized());
    } else {
      // Single click to start dragging
      await windowControls.startDragging();
    }
  };

  const handleWindowAction = async (action) => {
    if (action === "minimize") {
      await windowControls.minimize();
      return;
    }

    if (action === "maximize") {
      await windowControls.toggleMaximize();
      setIsMaximized(await windowControls.isMaximized());
      return;
    }

    await windowControls.close();
  };

  return (
    <div
      className={`custom-titlebar h-10 flex select-none shrink-0 ${isWindows ? "is-windows" : ""} ${isMac ? "is-mac" : ""} ${isLinux ? "is-linux" : ""}`}
      onMouseDown={handleMouseDown}
    >
      {/* Leading section — over the sidebar column, so its actions read as the
          sidebar's own. No wordmark and no hairline: the title bar and the
          sidebar are one surface, and the note's sheet starts below both. */}
      <div
        className="titlebar-left flex items-center shrink-0"
        style={{
          width: showSidebar ? `${sidebarWidth}px` : "auto",
          paddingInlineStart: isMac ? "80px" : "8px",
        }}
      >
        {/* The toggle is deliberately rendered in one place for both states
            instead of once per branch: its icon morphs between open and closed
            with a CSS transition, and a button that unmounts when the sidebar
            hides would take the transition with it and snap instead. Keeping it
            at the same child index lets React reuse the same DOM node. */}
        <div className={`flex items-center gap-0.5 ${showSidebar ? "ms-auto me-2" : "ms-1"}`}>
          {showSidebar && (
            <>
              <button
                onClick={onNewNote}
                className="p-1.5 hover:bg-overlay-light rounded-md text-text-secondary hover:text-text-primary transition-colors"
                title="New Note (⌘N)"
                aria-label="New note"
                data-no-drag
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
              <button
                onClick={onNewFolder}
                className="p-1.5 hover:bg-overlay-light rounded-md text-text-secondary hover:text-text-primary transition-colors"
                title="New Folder"
                aria-label="New folder"
                data-no-drag
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                  />
                </svg>
              </button>
            </>
          )}
          {/* The sidebar could always be collapsed with the shortcut, but
              nothing on screen said so — this is that affordance, sitting
              at the sidebar's own edge so it reads as belonging to it. */}
          <button
            onClick={onToggleSidebar}
            className="p-1.5 hover:bg-overlay-light active:scale-95 rounded-md text-text-secondary hover:text-text-primary transition-all"
            title={`${showSidebar ? "Hide" : "Show"} sidebar (${sidebarShortcut})`}
            aria-label={showSidebar ? "Hide sidebar" : "Show sidebar"}
            aria-expanded={showSidebar}
            data-no-drag
          >
            <SidebarIcon open={showSidebar} className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs — quiet pills. The open note is the one lifted onto the page's
          own surface, the same tone as the sheet below it. */}
      <div className="flex-1 flex items-center min-w-0 ps-1">
        {openNotes.length > 0 && (
          <div
            ref={scrollRef}
            className="flex items-center gap-0.5 overflow-x-auto no-scrollbar scroll-smooth py-1"
            role="tablist"
            aria-label="Open notes"
            data-no-drag
          >
            {openNotes.map((note) => {
              const isActive = note.id === currentNoteId;
              const isSettings = note.id === SETTINGS_TAB_ID;
              return (
                <div
                  key={note.id}
                  role="tab"
                  aria-selected={isActive}
                  className={`
                    group flex items-center gap-1.5 h-7 ps-3 pe-1 rounded-md cursor-pointer transition-colors min-w-24 max-w-50 shrink-0
                    ${
                      isActive
                        ? "bg-bg-editor text-text-primary font-semibold shadow-[0_0_0_1px_var(--color-border)] active-tab"
                        : "text-text-secondary hover:bg-item-hover hover:text-text-primary"
                    }
                  `}
                  onClick={() => selectNote(note.id)}
                >
                  {isSettings && (
                    <svg
                      className="w-3.5 h-3.5 shrink-0 text-text-muted"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  )}

                  <span className="text-[12.5px] truncate flex-1" title={note.name}>
                    {note.name}
                  </span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onCloseTab) {
                        onCloseTab(note.id);
                      } else {
                        closeNote(note.id);
                      }
                    }}
                    aria-label={`Close ${note.name}`}
                    className={`
                      p-0.5 rounded hover:bg-overlay-light text-text-muted hover:text-text-primary transition-colors shrink-0
                      ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}
                    `}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty draggable space - takes remaining width */}
        <div className="flex-1 h-full" />
      </div>

      {/* The editor's controls land here (see `titlebarSlot` in uiStore). */}
      <div
        ref={setTitlebarSlot}
        className="flex items-center shrink-0 pe-2 empty:pe-0"
        data-no-drag
      />

      {!isMac && (
        <div className="titlebar-window-controls flex h-full shrink-0" data-no-drag>
          <button
            type="button"
            className="titlebar-window-button"
            onClick={() => handleWindowAction("minimize")}
            title="Minimize"
            aria-label="Minimize window"
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 6h8" />
            </svg>
          </button>
          <button
            type="button"
            className="titlebar-window-button"
            onClick={() => handleWindowAction("maximize")}
            title={isMaximized ? "Restore" : "Maximize"}
            aria-label={isMaximized ? "Restore window" : "Maximize window"}
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              {isMaximized ? <path d="M3.5 4.5h4v4h-4zM4.5 3.5h4v4" /> : <path d="M3 3h6v6H3z" />}
            </svg>
          </button>
          <button
            type="button"
            className="titlebar-window-button titlebar-close-button"
            onClick={() => handleWindowAction("close")}
            title="Close"
            aria-label="Close window"
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 3l6 6M9 3L3 9" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default TitleBar;
