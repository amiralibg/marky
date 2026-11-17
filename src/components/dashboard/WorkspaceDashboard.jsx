import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useNotesStore from "../../store/notesStore";
import useUIStore from "../../store/uiStore";
import useSettingsStore from "../../store/settingsStore";
import { documentWordCount } from "../../utils/documentText";
import { isHtmlDocument } from "../../utils/documentKind";
import { buildFrameDocument, MINIATURE_SIZE_LIMIT } from "../../utils/htmlFrame";
import { resolveDocumentLocation } from "../../utils/htmlDocuments";
import {
  buildChildrenIndex,
  findVaultRoot,
  libraryBreadcrumb,
  libraryChildren,
  newestNoteIn,
  pinnedLibraryNotes,
  recentLibraryNotes,
  relativeDate,
} from "../../utils/library";
import { peekMiniature, renderMiniature } from "./miniature";
import EmptyState from "../ui/EmptyState";
import { LoadingState, Skeleton, SkeletonCards } from "../ui/Loading";
import { useLoadingPhase } from "../ui/useDelayedFlag";

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

const todayLabel = () =>
  new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

const FREQUENCY_LABEL = {
  daily: "Every day",
  weekly: "Weekly",
  monthly: "Monthly",
};

const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatTime = (timeOfDay = "09:00") => {
  const [h, m] = timeOfDay.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h)) return timeOfDay;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m || 0).padStart(2, "0")} ${period}`;
};

const scheduleCadence = (schedule) => {
  const time = formatTime(schedule.timeOfDay);
  if (schedule.frequency === "weekly" && schedule.daysOfWeek?.length) {
    const days = schedule.daysOfWeek.map((d) => WEEKDAY_ABBR[d]).join(", ");
    return `${days} · ${time}`;
  }
  return `${FREQUENCY_LABEL[schedule.frequency] || schedule.frequency} · ${time}`;
};

const plural = (count, word) => `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;

// 24px stroke glyphs at 1.6, the weight the sidebar and title bar use.
const GLYPHS = {
  plus: "M12 5v14M5 12h14",
  folder: "M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z",
  doc: "M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8zM14 3.5V8h4.5M9 12.5h6M9 16h4",
  code: "M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8zM14 3.5V8h4.5M10.5 12 8.5 14.2l2 2.3M13.5 12l2 2.2-2 2.3",
  rows: "M4 7h16M4 12h16M4 17h16",
  repeat: "M17 3.5 20 6.5l-3 3M20 6.5H8a4 4 0 0 0-4 4v1M7 20.5l-3-3 3-3M4 17.5h12a4 4 0 0 0 4-4v-1",
  chevron: "m9 6 6 6-6 6",
  pin: "M9 4h6l-.8 6 3 3.2H6.8l3-3.2zM12 13.5V20",
  clock: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2",
};

const GRID_GLYPH = (
  <>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </>
);

const Glyph = ({ name, className = "h-4 w-4" }) => (
  <svg
    className={`${className} shrink-0`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {name === "grid" ? GRID_GLYPH : <path d={GLYPHS[name]} />}
  </svg>
);

/* ── Lazy miniature rendering ──────────────────────────────────────────────
   One IntersectionObserver for every card, and one idle-time queue: a card
   asks for its miniature only once it comes near the viewport, and the
   render runs when the main thread is free, a few per idle slice, so a Home
   full of cards neither delays its own first paint nor a keystroke. */

const observed = new Map();
let observer = null;

const observeNearViewport = (element, onVisible) => {
  if (typeof IntersectionObserver === "undefined") {
    onVisible();
    return () => {};
  }
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const callback = observed.get(entry.target);
          observer.unobserve(entry.target);
          observed.delete(entry.target);
          callback?.();
        }
      },
      { rootMargin: "240px 0px" }
    );
  }
  observed.set(element, onVisible);
  observer.observe(element);
  return () => {
    observed.delete(element);
    observer?.unobserve(element);
  };
};

const queue = [];
let idleHandle = null;

const requestIdle =
  typeof window !== "undefined" && window.requestIdleCallback
    ? (fn) => window.requestIdleCallback(fn, { timeout: 600 })
    : (fn) => setTimeout(() => fn({ timeRemaining: () => 8, didTimeout: false }), 16);

const drainQueue = (deadline) => {
  idleHandle = null;
  // At least one per slice, so a busy thread still makes progress.
  do {
    const task = queue.shift();
    if (task && !task.cancelled) task.run();
  } while (queue.length > 0 && deadline.timeRemaining() > 4);
  if (queue.length > 0) idleHandle = requestIdle(drainQueue);
};

const scheduleIdle = (run) => {
  const task = { run, cancelled: false };
  queue.push(task);
  if (idleHandle == null) idleHandle = requestIdle(drainQueue);
  return () => {
    task.cancelled = true;
  };
};

/**
 * A note's real Read-mode page at 6.4px. Inert and hidden from assistive
 * tech: the card's own name and metadata are what it announces.
 */
const Miniature = ({ note, className = "mini" }) => {
  const ref = useRef(null);
  const [html, setHtml] = useState(() => peekMiniature(note));
  const hasContent = note?.content != null;

  useEffect(() => {
    if (!note || !hasContent) {
      setHtml(undefined);
      return undefined;
    }
    const cached = peekMiniature(note);
    if (cached !== undefined) {
      setHtml(cached);
      return undefined;
    }
    setHtml(undefined);
    let cancelTask = () => {};
    const element = ref.current;
    if (!element) return undefined;
    const stopObserving = observeNearViewport(element, () => {
      cancelTask = scheduleIdle(() => setHtml(renderMiniature(note)));
    });
    return () => {
      stopObserving();
      cancelTask();
    };
    // The note object changes identity on every store update; these
    // are what the rendered page depends on.
  }, [note?.id, note?.updatedAt, note?.content, hasContent]);

  // The page is rendered on idle; until then the card holds the shape of
  // one (only if that takes long enough to notice).
  const phase = useLoadingPhase(hasContent && html === undefined);

  if (phase !== "ready") {
    return (
      <div ref={ref} className={className} aria-hidden="true" inert="">
        {phase === "loading" && <MiniatureSkeleton />}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={className}
      aria-hidden="true"
      inert=""
      dir="auto"
      dangerouslySetInnerHTML={html ? { __html: html } : undefined}
    />
  );
};

/** A page's shape at miniature scale: a heading and a few lines. */
const MiniatureSkeleton = () => (
  <span className="flex flex-col gap-[7px]">
    <Skeleton className="mb-2 h-3 w-1/2 rounded-[4px]" />
    {["92%", "86%", "95%", "70%", "88%", "54%"].map((width) => (
      <Skeleton key={width} className="h-[5px] rounded-[3px]" style={{ width }} />
    ))}
  </span>
);

// The width an HTML miniature lays the page out at before it is scaled down
// to the card: a desktop page, the way the document was designed to be read.
const PAGE_WIDTH = 1024;

/**
 * An HTML document's miniature: the page itself in a frame sandboxed with no
 * permissions at all (`sandbox=""` — no scripts, no forms, an opaque origin),
 * a CSP that lets nothing leave the machine, scaled down to the card and
 * non-interactive. Built only when the card nears the viewport and the main
 * thread is idle, and not at all for very large files.
 */
const HtmlMiniature = ({ note, vaultRoot, className = "mini" }) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [location, setLocation] = useState(undefined);
  const [scale, setScale] = useState(0.2);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const tooLarge = (note?.content?.length || 0) > MINIATURE_SIZE_LIMIT;
  const hasContent = note?.content != null;

  useEffect(() => {
    const element = ref.current;
    if (!element || !hasContent || tooLarge) return undefined;
    let cancelTask = () => {};
    const stop = observeNearViewport(element, () => {
      cancelTask = scheduleIdle(() => setVisible(true));
    });
    return () => {
      stop();
      cancelTask();
    };
  }, [hasContent, tooLarge]);

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    resolveDocumentLocation(note.filePath, vaultRoot)
      .then((value) => !cancelled && setLocation(value))
      .catch(() => !cancelled && setLocation(null));
    return () => {
      cancelled = true;
    };
  }, [visible, note?.filePath, vaultRoot]);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (width > 0) setScale(width / PAGE_WIDTH);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const srcDoc = useMemo(() => {
    if (!visible || location === undefined || !hasContent || tooLarge) return null;
    return buildFrameDocument(note.content, {
      kind: "miniature",
      baseHref: location?.baseHref || "",
      documentOrigin: location?.origin || "",
    });
  }, [visible, location, hasContent, tooLarge, note?.content]);

  useEffect(() => {
    setFrameLoaded(false);
    if (!srcDoc) return undefined;
    // A frame that never reports its load must not leave a card pulsing.
    const timer = setTimeout(() => setFrameLoaded(true), 4000);
    return () => clearTimeout(timer);
  }, [srcDoc]);
  // Until the page in the frame has loaded, the card shows a page's shape
  // over it (after the usual delay, for its minimum time).
  const phase = useLoadingPhase(hasContent && !tooLarge && !frameLoaded);

  return (
    <div ref={ref} className={`${className} mini-page`} aria-hidden="true" inert="">
      {srcDoc && (
        <iframe
          sandbox=""
          srcDoc={srcDoc}
          title=""
          tabIndex={-1}
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setFrameLoaded(true)}
          style={{
            transform: `scale(${scale})`,
            height: `${100 / scale}%`,
            opacity: phase === "ready" ? 1 : 0,
          }}
        />
      )}
      {phase === "loading" && (
        <span className="absolute inset-0 bg-item-active px-5 pt-5">
          <MiniatureSkeleton />
        </span>
      )}
      {tooLarge && <span className="mini-media" />}
    </div>
  );
};

const DocCard = ({ note, place, onOpen, vaultRoot }) => (
  <button
    type="button"
    data-home-item=""
    className="doc-card"
    onClick={() => onOpen(note.id)}
    title={note.filePath || note.name}
  >
    {isHtmlDocument(note) ? (
      <HtmlMiniature note={note} vaultRoot={vaultRoot} />
    ) : (
      <Miniature note={note} />
    )}
    <span className="doc-card-foot">
      <span className="min-w-0 flex-1">
        <span className="doc-card-name" dir="auto">
          {note.name}
        </span>
        <span className="doc-card-meta">
          <span dir="auto">{place}</span>
          {place && note.updatedAt ? " · " : ""}
          {relativeDate(note.updatedAt || note.createdAt)}
        </span>
      </span>
      {isHtmlDocument(note) && <span className="kind-tag is-badge">HTML</span>}
    </span>
  </button>
);

const FolderCard = ({ folder, count, htmlCount = 0, newest, onOpen, vaultRoot }) => (
  <button
    type="button"
    data-home-item=""
    className="folder-card"
    onClick={() => onOpen(folder.id)}
    title={folder.filePath || folder.name}
  >
    {count > 0 && (
      <>
        <span className="folder-sheet is-back" aria-hidden="true" />
        <span className="folder-sheet" aria-hidden="true">
          {newest &&
            (isHtmlDocument(newest) ? (
              <HtmlMiniature note={newest} vaultRoot={vaultRoot} />
            ) : (
              <Miniature note={newest} />
            ))}
        </span>
      </>
    )}
    <span className="folder-pocket">
      <span className="folder-pocket-name" dir="auto">
        {folder.name}
      </span>
      <span className="folder-pocket-meta">
        {count === 0 ? "Empty" : plural(count, "item")}
        {htmlCount > 0 ? ` · ${htmlCount} HTML` : ""}
      </span>
    </span>
  </button>
);

const ListRow = ({ item, place, meta, onOpen }) => (
  <button
    type="button"
    data-home-item=""
    className="list-row"
    onClick={() => onOpen(item)}
    title={item.filePath || item.name}
  >
    <Glyph
      name={item.type === "folder" ? "folder" : isHtmlDocument(item) ? "code" : "doc"}
      className="h-4 w-4 text-text-muted"
    />
    <span className="min-w-0 flex-1 truncate font-semibold text-text-primary" dir="auto">
      {item.name}
    </span>
    {place && (
      <span className="hidden max-w-[30%] truncate text-text-muted sm:block" dir="auto">
        {place}
      </span>
    )}
    <span className="w-28 shrink-0 truncate text-end text-text-muted">{meta}</span>
  </button>
);

// Cards past this many wait behind a "Show more": a folder of a few thousand
// notes should not put a few thousand buttons in the DOM to draw one screen.
const PAGE_SIZE = 60;

/**
 * Arrow keys move between cards as well as Tab. Left/right step through the
 * list (mirrored in RTL); up/down jump to the card in the same column of the
 * row above or below, measured from the layout so it follows the grid's
 * auto-fill column count.
 */
const handleGridKeyDown = (event) => {
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const container = event.currentTarget;
  const cards = [...container.querySelectorAll("[data-home-item]")];
  const index = cards.indexOf(document.activeElement);
  if (index === -1) return;
  const rtl = getComputedStyle(container).direction === "rtl";
  let next = index;
  if (event.key === "Home") next = 0;
  else if (event.key === "End") next = cards.length - 1;
  else if (event.key === "ArrowRight") next = index + (rtl ? -1 : 1);
  else if (event.key === "ArrowLeft") next = index + (rtl ? 1 : -1);
  else {
    const current = cards[index].getBoundingClientRect();
    const down = event.key === "ArrowDown";
    const candidates = cards
      .map((card, i) => ({ i, rect: card.getBoundingClientRect() }))
      .filter(({ rect }) => (down ? rect.top > current.top + 4 : rect.top < current.top - 4));
    if (candidates.length > 0) {
      const rowTop = down
        ? Math.min(...candidates.map(({ rect }) => rect.top))
        : Math.max(...candidates.map(({ rect }) => rect.top));
      const row = candidates.filter(({ rect }) => Math.abs(rect.top - rowTop) < 4);
      next = row.reduce((best, c) =>
        Math.abs(c.rect.left - current.left) < Math.abs(best.rect.left - current.left) ? c : best
      ).i;
    }
  }
  if (next !== index && cards[next]) {
    event.preventDefault();
    cards[next].focus();
  }
};

const WorkspaceDashboard = () => {
  const {
    items,
    rootFolderPath,
    createFolder,
    selectNote,
    recentNotes,
    pinnedNotes,
    scheduledNotes,
    isLoading,
  } = useNotesStore();
  const {
    addNotification,
    setShowWorkspaceModal,
    requestTemplateModal,
    requestScheduleModal,
    homeFolderId,
    setHomeFolderId,
  } = useUIStore();
  const homeView = useSettingsStore((state) => state.homeView);
  const homeLayout = useSettingsStore((state) => state.homeLayout);
  const setHomeView = useSettingsStore((state) => state.setHomeView);
  const setHomeLayout = useSettingsStore((state) => state.setHomeLayout);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const hasWorkspace = Boolean(rootFolderPath);
  const vaultRoot = useMemo(() => findVaultRoot(items, rootFolderPath), [items, rootFolderPath]);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const childrenIndex = useMemo(() => buildChildrenIndex(items), [items]);
  const documents = useMemo(
    () => items.filter((item) => item.type === "note" && !item.isLoose),
    [items]
  );
  // Notes and HTML documents are counted apart, as the mockup's hero line
  // reads: "42 notes, 4 HTML documents".
  const notes = useMemo(() => documents.filter((item) => !isHtmlDocument(item)), [documents]);
  const htmlDocumentCount = documents.length - notes.length;
  const wordCount = useMemo(
    () => documents.reduce((total, doc) => total + documentWordCount(doc), 0),
    [documents]
  );
  const displayWorkspacePath = useMemo(
    () => (rootFolderPath ? rootFolderPath.replace(/^\/(Users|home)\/[^/]+/, "~") : ""),
    [rootFolderPath]
  );
  const upcomingSchedules = useMemo(() => (scheduledNotes || []).slice(0, 4), [scheduledNotes]);
  const recent = useMemo(() => recentLibraryNotes(recentNotes, items, 12), [recentNotes, items]);
  const pinned = useMemo(() => pinnedLibraryNotes(pinnedNotes, items), [pinnedNotes, items]);

  // The folder on show; one that has gone (deleted, renamed) falls back to
  // the vault root rather than leaving Home on a dead breadcrumb.
  const rootId = vaultRoot?.id ?? null;
  const breadcrumb = useMemo(
    () => libraryBreadcrumb(itemsById, rootId, homeFolderId ?? rootId),
    [itemsById, rootId, homeFolderId]
  );
  const currentFolderId = breadcrumb.length ? breadcrumb[breadcrumb.length - 1].id : rootId;
  const libraryItems = useMemo(
    () => (currentFolderId ? libraryChildren(childrenIndex, currentFolderId) : []),
    [childrenIndex, currentFolderId]
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [homeView, currentFolderId]);

  const placeOf = useCallback(
    (item) => {
      const parent = item.parentId != null ? itemsById.get(item.parentId) : null;
      return parent?.name || "";
    },
    [itemsById]
  );

  const openFolder = useCallback(
    (folderId) => setHomeFolderId(folderId === rootId ? null : folderId),
    [rootId, setHomeFolderId]
  );
  const openItem = useCallback(
    (item) => (item.type === "folder" ? openFolder(item.id) : selectNote(item.id)),
    [openFolder, selectNote]
  );

  const handleCreateFolder = async () => {
    try {
      await createFolder();
      addNotification("New folder created", "success");
    } catch (error) {
      if (/workspace/i.test(error.message)) {
        setShowWorkspaceModal(true);
      } else {
        addNotification(`Failed to create folder: ${error.message}`, "error");
      }
    }
  };

  if (!hasWorkspace) {
    return (
      <div className="h-full overflow-y-auto bg-bg-editor">
        <main className="flex min-h-full items-center justify-center px-6 py-12">
          <section className="w-full max-w-lg rounded-panel bg-item-active px-8 py-10 text-center shadow-[0_0_0_1px_var(--color-border)]">
            <span className="mx-auto mb-6 grid h-12 w-12 place-items-center rounded-card bg-accent-dim text-accent">
              <Glyph name="folder" className="h-6 w-6" />
            </span>
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-text-primary">
              Choose a folder for your notes
            </h1>
            <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-text-secondary">
              Marky keeps notes as plain files in a folder on your computer. Pick the folder to use
              as your workspace, then create notes and folders inside it.
            </p>
            <button
              type="button"
              onClick={() => setShowWorkspaceModal(true)}
              className="btn btn-primary mt-7"
            >
              Open a folder
            </button>
          </section>
        </main>
      </div>
    );
  }

  const viewItems = homeView === "recent" ? recent : homeView === "pinned" ? pinned : libraryItems;
  const shownItems = viewItems.slice(0, visibleCount);
  const isLibrary = homeView === "library";
  const atRoot = breadcrumb.length <= 1;

  const emptyState = (() => {
    if (homeView === "recent") {
      return (
        <EmptyState
          icon="clock"
          title="Nothing here yet"
          body="Notes you open or edit show up here, newest first. Open one from the library to start."
          action={{ label: "Browse the library", onClick: () => setHomeView("library") }}
        />
      );
    }
    if (homeView === "pinned") {
      return (
        <EmptyState
          icon="pin"
          title="No pinned notes"
          body="Pin the notes you keep coming back to. Right-click a note in the sidebar and choose Pin to top."
          action={{ label: "Browse the library", onClick: () => setHomeView("library") }}
        />
      );
    }
    return atRoot ? (
      <EmptyState
        icon="doc"
        title="This vault is empty"
        body="The notes and folders you create here show up as cards, folders first."
        action={{ label: "Choose a template", onClick: () => requestTemplateModal(null) }}
      />
    ) : (
      <EmptyState
        icon="folder"
        title="This folder is empty"
        body="Notes and folders saved here show up as cards. Start one from a template."
        action={{
          label: "New note here",
          onClick: () => requestTemplateModal(currentFolderId),
        }}
      />
    );
  })();

  const folderMeta = (folder) => {
    const children = childrenIndex.get(folder.id) || [];
    const count = children.length;
    const htmlCount = children.filter(
      (child) => child.type === "note" && isHtmlDocument(child)
    ).length;
    return {
      count,
      htmlCount,
      label:
        count === 0
          ? "Empty"
          : `${plural(count, "item")}${htmlCount > 0 ? ` · ${htmlCount} HTML` : ""}`,
    };
  };

  return (
    <div className="h-full overflow-y-auto bg-bg-editor">
      <main className="mx-auto max-w-[1120px] px-12 pb-16 pt-14 max-sm:px-6">
        <header className="mb-10 flex flex-wrap items-end gap-6">
          <div className="min-w-0">
            <h1 className="text-[40px] font-bold leading-[1.1] tracking-[-0.028em] text-text-primary [text-wrap:balance]">
              {greeting()}
            </h1>
            <p className="mt-2 text-[15px] text-text-secondary">
              {todayLabel()} · {plural(notes.length, "note")}
              {htmlDocumentCount > 0 && `, ${plural(htmlDocumentCount, "HTML document")}`}
            </p>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <button type="button" className="btn" onClick={() => requestTemplateModal(null)}>
              Templates
            </button>
            <button type="button" className="btn" onClick={handleCreateFolder}>
              New folder
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => requestTemplateModal(null)}
            >
              <Glyph name="plus" />
              New note
            </button>
          </div>
        </header>

        <div className="mb-5 flex items-center gap-1">
          <div className="flex items-center gap-1" role="group" aria-label="Show">
            {[
              { id: "library", label: "Library" },
              { id: "recent", label: "Recent" },
              { id: "pinned", label: "Pinned", count: pinned.length },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                className="chip"
                aria-pressed={homeView === chip.id}
                onClick={() => setHomeView(chip.id)}
              >
                {chip.label}
                {chip.count > 0 && <small>{chip.count}</small>}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <div className="seg" role="group" aria-label="Layout">
            <button
              type="button"
              aria-pressed={homeLayout === "grid"}
              aria-label="Grid"
              title="Grid"
              onClick={() => setHomeLayout("grid")}
            >
              <Glyph name="grid" />
            </button>
            <button
              type="button"
              aria-pressed={homeLayout === "list"}
              aria-label="List"
              title="List"
              onClick={() => setHomeLayout("list")}
            >
              <Glyph name="rows" />
            </button>
          </div>
        </div>

        {isLibrary && !atRoot && (
          <nav aria-label="Folder path" className="-ms-2 mb-4">
            <ol className="flex flex-wrap items-center gap-0.5 text-[13.5px]">
              {breadcrumb.map((crumb, i) => {
                const last = i === breadcrumb.length - 1;
                return (
                  <li key={crumb.id} className="flex min-w-0 items-center gap-0.5">
                    {i > 0 && (
                      <Glyph name="chevron" className="h-3 w-3 text-text-muted rtl:-scale-x-100" />
                    )}
                    <button
                      type="button"
                      onClick={() => openFolder(crumb.id)}
                      aria-current={last ? "page" : undefined}
                      className={`h-7 max-w-[16rem] truncate rounded-control px-2 transition-colors hover:bg-item-hover ${
                        last
                          ? "font-semibold text-text-primary"
                          : "font-medium text-text-secondary hover:text-text-primary"
                      }`}
                      dir="auto"
                    >
                      {crumb.name}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        {viewItems.length === 0 && isLoading ? (
          <LoadingState label="Loading the vault">
            <SkeletonCards count={8} />
          </LoadingState>
        ) : viewItems.length === 0 ? (
          emptyState
        ) : homeLayout === "list" ? (
          <div className="row-group overflow-hidden" onKeyDown={handleGridKeyDown}>
            {shownItems.map((item) => {
              const isFolder = item.type === "folder";
              return (
                <ListRow
                  key={item.id}
                  item={item}
                  place={isFolder ? "" : placeOf(item)}
                  meta={
                    isFolder
                      ? folderMeta(item).label
                      : relativeDate(item.updatedAt || item.createdAt)
                  }
                  onOpen={openItem}
                />
              );
            })}
          </div>
        ) : (
          <div
            className="grid grid-cols-[repeat(auto-fill,minmax(208px,1fr))] gap-5"
            onKeyDown={handleGridKeyDown}
          >
            {shownItems.map((item) =>
              item.type === "folder" ? (
                <FolderCard
                  key={item.id}
                  folder={item}
                  count={folderMeta(item).count}
                  htmlCount={folderMeta(item).htmlCount}
                  newest={newestNoteIn(childrenIndex, item.id)}
                  onOpen={openFolder}
                  vaultRoot={rootFolderPath}
                />
              ) : (
                <DocCard
                  key={item.id}
                  note={item}
                  place={placeOf(item)}
                  onOpen={selectNote}
                  vaultRoot={rootFolderPath}
                />
              )
            )}
          </div>
        )}

        {viewItems.length > shownItems.length && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              className="btn"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            >
              Show {Math.min(PAGE_SIZE, viewItems.length - shownItems.length)} more
            </button>
          </div>
        )}

        <section className="mt-12">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="section-heading">Upcoming &amp; recurring</h2>
            <button type="button" className="btn btn-sm" onClick={() => requestScheduleModal(null)}>
              <Glyph name="plus" />
              New schedule
            </button>
          </div>
          {upcomingSchedules.length > 0 ? (
            <div className="row-group">
              {upcomingSchedules.map((schedule) => {
                const folderName = schedule.folderId && itemsById.get(schedule.folderId)?.name;
                return (
                  <div
                    key={schedule.id}
                    className="flex h-12 items-center gap-3 px-4 text-[13.5px]"
                  >
                    <Glyph name="repeat" className="h-4 w-4 text-text-muted" />
                    <span
                      className="min-w-0 flex-1 truncate font-semibold text-text-primary"
                      dir="auto"
                    >
                      {schedule.noteName || schedule.templateName}
                    </span>
                    <span className="shrink-0 truncate text-[12.5px] text-text-muted">
                      {scheduleCadence(schedule)}
                      {folderName ? ` · ${folderName}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-card shadow-[0_0_0_1px_var(--color-border)]">
              <EmptyState
                compact
                icon="calendar"
                title="No recurring notes yet"
                body="A schedule creates a daily, weekly or monthly note from a template."
              />
            </div>
          )}
        </section>

        <footer className="mt-12 flex flex-wrap justify-center gap-x-6 gap-y-1 text-[12.5px] text-text-muted">
          {displayWorkspacePath && (
            <span className="font-mono text-[12px]">{displayWorkspacePath}</span>
          )}
          <span>{plural(notes.length, "note")}</span>
          <span>{plural(wordCount, "word")}</span>
        </footer>
      </main>
    </div>
  );
};

export default WorkspaceDashboard;
