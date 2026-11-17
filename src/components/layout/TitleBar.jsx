import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import useNotesStore, { SETTINGS_TAB_ID } from "../../store/notesStore";
import useSettingsStore, { formatKeymap } from "../../store/settingsStore";
import useUIStore from "../../store/uiStore";
import { SidebarIcon } from "../icons";
import { detectPlatform } from "../../utils/platform";
import { isHtmlDocument } from "../../utils/documentKind";

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
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const syncScrollEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const maxScroll = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 2;
    const right = maxScroll > 2 && el.scrollLeft < maxScroll - 2;
    setCanScrollLeft(left);
    setCanScrollRight(right);
  }, []);

  const handleTabsWheel = useCallback((e) => {
    if (e.deltaX === 0 && e.deltaY !== 0 && scrollRef.current) {
      e.preventDefault();
      scrollRef.current.scrollBy({ left: e.deltaY, behavior: "auto" });
    }
  }, []);

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
    syncScrollEdges();
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener("scroll", syncScrollEdges, { passive: true });

    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(syncScrollEdges);
      ro.observe(el);
    }
    window.addEventListener("resize", syncScrollEdges);

    return () => {
      el.removeEventListener("scroll", syncScrollEdges);
      ro?.disconnect();
      window.removeEventListener("resize", syncScrollEdges);
    };
  }, [syncScrollEdges, openNotes.length, showSidebar, sidebarWidth]);

  useEffect(() => {
    const activeTab = scrollRef.current?.querySelector(".active-tab");
    if (activeTab && typeof activeTab.scrollIntoView === "function") {
      activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
    const timer = setTimeout(syncScrollEdges, 250);
    return () => clearTimeout(timer);
  }, [currentNoteId, syncScrollEdges]);

  const FADE_SIZE = 28;
  const tabsMask = useMemo(() => {
    if (!canScrollLeft && !canScrollRight) return undefined;
    const leftStop = canScrollLeft ? `transparent 0px, black ${FADE_SIZE}px` : "black 0px";
    const rightStop = canScrollRight
      ? `black calc(100% - ${FADE_SIZE}px), transparent 100%`
      : "black 100%";
    return `linear-gradient(to right, ${leftStop}, ${rightStop})`;
  }, [canScrollLeft, canScrollRight]);

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
      // 52px on macOS: the window's empty unified toolbar (install_title_toolbar
      // in main.rs) centres the traffic lights 26px down, so the row matches.
      className={`custom-titlebar ${isMac ? "h-[52px]" : "h-12"} flex select-none shrink-0 ${isWindows ? "is-windows" : ""} ${isMac ? "is-mac" : ""} ${isLinux ? "is-linux" : ""}`}
      onMouseDown={handleMouseDown}
    >
      {/* Leading section — over the sidebar column, so its actions read as the
          sidebar's own. No wordmark and no hairline: the title bar and the
          sidebar are one surface, the desk, and the sheet floats below both. */}
      <div
        className="titlebar-left flex items-center shrink-0"
        style={{
          width: showSidebar ? `${sidebarWidth}px` : "auto",
          paddingInlineStart: isMac ? "80px" : "12px",
        }}
      >
        {/* The toggle is deliberately rendered in one place for both states
            instead of once per branch: its icon morphs between open and closed
            with a CSS transition, and a button that unmounts when the sidebar
            hides would take the transition with it and snap instead. Keeping it
            at the same child index lets React reuse the same DOM node.

            Only macOS pushes these to the sidebar's far edge, next to the traffic
            lights. Windows and Linux have nothing on the left of the bar, so the
            same push would leave a sidebar's width of empty space before them. */}
        <div
          className={`flex items-center gap-0.5 me-3 ${isMac ? (showSidebar ? "ms-auto" : "ms-1") : ""}`}
        >
          {showSidebar && (
            <>
              <button
                onClick={onNewNote}
                className="icon-btn"
                title="New Note (⌘N)"
                aria-label="New note"
                data-no-drag
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
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              <button
                onClick={onNewFolder}
                className="icon-btn"
                title="New Folder"
                aria-label="New folder"
                data-no-drag
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
                  <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM12 10.5v5M9.5 13h5" />
                </svg>
              </button>
            </>
          )}
          {/* The sidebar could always be collapsed with the shortcut, but
              nothing on screen said so — this is that affordance, sitting
              at the sidebar's own edge so it reads as belonging to it. */}
          <button
            onClick={onToggleSidebar}
            className="icon-btn"
            title={`${showSidebar ? "Hide" : "Show"} sidebar (${sidebarShortcut})`}
            aria-label={showSidebar ? "Hide sidebar" : "Show sidebar"}
            aria-expanded={showSidebar}
            data-no-drag
          >
            <SidebarIcon open={showSidebar} />
          </button>
        </div>
      </div>

      {/* Tabs — 32px pills. The active one takes the translucent pill fill and
          weight, no ring. Dissolves with a soft blur and mask at the edges
          whenever tabs overflow and scroll. */}
      <div className="flex-1 flex items-center min-w-0">
        {openNotes.length > 0 && (
          <div className="relative flex items-center min-w-0 max-w-full" data-no-drag>
            {canScrollLeft && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-0.5 bottom-0.5 w-7 z-10"
                style={{
                  backdropFilter: "blur(2.5px)",
                  WebkitBackdropFilter: "blur(2.5px)",
                  maskImage: "linear-gradient(to right, black 25%, transparent 100%)",
                  WebkitMaskImage: "linear-gradient(to right, black 25%, transparent 100%)",
                }}
              />
            )}

            <div
              ref={scrollRef}
              onScroll={syncScrollEdges}
              onWheel={handleTabsWheel}
              className="flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth py-1 px-1 min-w-0 max-w-full"
              style={{
                maskImage: tabsMask,
                WebkitMaskImage: tabsMask,
                scrollPadding: "0 28px",
              }}
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
                      group flex items-center gap-2 h-8 ps-3 pe-1 rounded-control cursor-pointer min-w-24 max-w-50 shrink-0 text-[13px]
                      transition-[background-color,color] duration-140
                      ${
                        isActive
                          ? "bg-pill text-text-primary font-semibold active-tab"
                          : "font-medium text-text-secondary hover:bg-item-hover hover:text-text-primary"
                      }
                    `}
                    onClick={() => selectNote(note.id)}
                  >
                    {isSettings && (
                      <svg
                        className="w-3.5 h-3.5 shrink-0 text-text-muted"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
                      </svg>
                    )}

                    {!isSettings && isHtmlDocument(note) && (
                      <span className="kind-tag" aria-label="HTML document">
                        HTML
                      </span>
                    )}
                    <span className="truncate flex-1" title={note.name}>
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
                        grid h-6 w-6 shrink-0 place-items-center rounded-control text-text-muted
                        transition-[background-color,color,opacity] duration-140
                        hover:bg-item-hover hover:text-text-primary focus-visible:opacity-100
                        ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}
                      `}
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path d="m6 6 12 12M18 6 6 18" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>

            {canScrollRight && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-0 top-0.5 bottom-0.5 w-7 z-10"
                style={{
                  backdropFilter: "blur(2.5px)",
                  WebkitBackdropFilter: "blur(2.5px)",
                  maskImage: "linear-gradient(to left, black 25%, transparent 100%)",
                  WebkitMaskImage: "linear-gradient(to left, black 25%, transparent 100%)",
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* The editor's controls land here (see `titlebarSlot` in uiStore).
          Separated from the tab strip by comfortable spacing so mode switching
          never collides with or looks fixed into the open tabs. The 12px end
          padding lines the ⋯ button up with the sheet's trailing edge, inside
          its 8px gap. */}
      <div
        ref={setTitlebarSlot}
        className="flex items-center shrink-0 ms-3 pe-3 empty:ms-0 empty:pe-0"
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
