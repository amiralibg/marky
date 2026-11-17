import { useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Fuse from "fuse.js";
import useNotesStore from "../../store/notesStore";
import useSettingsStore, { formatShortcutHint } from "../../store/settingsStore";
import useModalAccessibility from "../../hooks/useModalAccessibility";
import { documentExcerpt, documentText } from "../../utils/documentText";
import { isHtmlDocument } from "../../utils/documentKind";
import { scrollItemIntoView } from "../../utils/scrollItemIntoView";
import {
  NoteIcon,
  NotePlusIcon,
  CodeDocumentIcon,
  FolderPlusIcon,
  FolderOpenIcon,
  CalendarIcon,
  SaveIcon,
  SearchIcon,
  SidebarIcon,
  EditIcon,
  GraphIcon,
  ExportIcon,
  SettingsIcon,
  KeyboardIcon,
  FocusIcon,
  ArchiveIcon,
  TemplateIcon,
  TextSizeIcon,
  WindowIcon,
  LinkIcon,
  BookmarkIcon,
  PinIcon,
} from "../icons";
import EmptyState from "../ui/EmptyState";

const CommandPalette = ({ isOpen, onClose, onExecuteCommand }) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [results, setResults] = useState([]);
  const inputRef = useRef(null);
  const resultsContainerRef = useRef(null);
  const dialogRef = useRef(null);
  const resultsListboxId = "command-palette-results";
  const activeResultId = results.length > 0 ? `command-palette-result-${selectedIndex}` : undefined;

  const { items, currentNoteId, isPinned } = useNotesStore();
  const keymaps = useSettingsStore((state) => state.keymaps);
  useModalAccessibility(isOpen, dialogRef, inputRef);
  const currentNote = items.find((item) => item.id === currentNoteId && item.type === "note");

  // Define available commands
  const commands = useMemo(() => {
    const baseCommands = [
      // File Operations
      {
        id: "new-note",
        name: "New note",
        category: "File operations",
        icon: NotePlusIcon,
        action: "newNote",
        keywords: ["create", "add"],
      },
      {
        id: "new-html-document",
        name: "New HTML document",
        category: "File operations",
        icon: CodeDocumentIcon,
        action: "newHtmlDocument",
        keywords: ["create", "page", "web", "html"],
      },
      {
        id: "new-folder",
        name: "New folder",
        category: "File operations",
        icon: FolderPlusIcon,
        action: "newFolder",
        keywords: ["create", "directory"],
      },
      {
        id: "daily-note",
        name: "Open today’s daily note",
        category: "File operations",
        icon: CalendarIcon,
        action: "openDailyNote",
        keywords: ["journal", "today", "calendar"],
      },
      {
        id: "open-folder",
        name: "Open folder",
        category: "File operations",
        icon: FolderOpenIcon,
        action: "openFolder",
        keywords: ["import", "load"],
      },
      {
        id: "new-window",
        name: "New window",
        category: "File operations",
        icon: WindowIcon,
        action: "newWindow",
        keywords: ["empty window", "another window", "second window"],
      },
      {
        id: "open-folder-new-window",
        name: "Open folder in new window",
        category: "File operations",
        icon: WindowIcon,
        action: "openFolderInNewWindow",
        keywords: ["vault", "second window", "side by side", "another vault"],
      },
      {
        id: "save",
        name: "Save now",
        category: "File operations",
        icon: SaveIcon,
        action: "save",
        keywords: ["write", "flush", "save note"],
      },

      // Navigation
      {
        id: "search",
        name: "Search all notes",
        category: "Navigation",
        icon: SearchIcon,
        action: "search",
        keywords: ["find"],
      },
      {
        id: "toggle-sidebar",
        name: "Toggle sidebar",
        category: "Navigation",
        icon: SidebarIcon,
        action: "toggleSidebar",
        keywords: ["hide", "show"],
      },

      // View modes were removed — the editor's Source / Live / Read control is
      // the single switcher now.

      {
        id: "increase-font-size",
        name: "Increase font size",
        category: "View",
        icon: TextSizeIcon,
        action: "increaseFontSize",
        keywords: ["zoom", "bigger", "larger", "text size"],
      },
      {
        id: "decrease-font-size",
        name: "Decrease font size",
        category: "View",
        icon: TextSizeIcon,
        action: "decreaseFontSize",
        keywords: ["zoom", "smaller", "text size"],
      },
      {
        id: "reset-font-size",
        name: "Reset font size",
        category: "View",
        icon: TextSizeIcon,
        action: "resetFontSize",
        keywords: ["zoom", "default", "100%", "text size"],
      },

      // Tools
      {
        id: "graph",
        name: "Open graph view",
        category: "Tools",
        icon: GraphIcon,
        action: "openGraph",
        keywords: ["network", "connections"],
      },
      {
        id: "attachments",
        name: "Manage attachments",
        category: "Tools",
        icon: ArchiveIcon,
        action: "openAttachments",
        keywords: ["images", "files", "media", "unused"],
      },
      {
        id: "export",
        name: "Export note",
        category: "Tools",
        icon: ExportIcon,
        action: "exportNote",
        keywords: ["download", "save as"],
      },
      {
        id: "settings",
        name: "Open settings",
        category: "Tools",
        icon: SettingsIcon,
        action: "openSettings",
        keywords: ["preferences", "config"],
      },
      {
        id: "shortcuts",
        name: "Show keyboard shortcuts",
        category: "Help",
        icon: KeyboardIcon,
        action: "showShortcuts",
        keywords: ["help", "keybindings"],
      },

      // Focus
      {
        id: "focus-mode",
        name: "Toggle focus mode",
        category: "View",
        icon: FocusIcon,
        action: "toggleFocusMode",
        keywords: ["distraction", "zen", "write", "fullscreen"],
      },

      // Backup
      {
        id: "backup",
        name: "Backup workspace",
        category: "Tools",
        icon: ArchiveIcon,
        action: "backupWorkspace",
        keywords: ["export", "zip", "archive", "save"],
      },
    ];

    if (!currentNote) return baseCommands;

    const pinLabel = isPinned(currentNote.id) ? "Unpin current note" : "Pin current note";
    return [
      ...baseCommands,
      {
        id: "new-note-current-folder",
        name: "New note in current folder",
        category: "Current note",
        icon: NotePlusIcon,
        action: "newNoteInCurrentFolder",
        keywords: ["create", "same folder", "template"],
      },
      {
        id: "template-current-folder",
        name: "Open templates for current folder",
        category: "Current note",
        icon: TemplateIcon,
        action: "openTemplatesForCurrentFolder",
        keywords: ["template", "same folder"],
      },
      {
        id: "rename-current-note",
        name: "Rename current note",
        category: "Current note",
        icon: EditIcon,
        action: "renameCurrentNote",
        keywords: ["title", "file name"],
      },
      {
        id: "open-current-in-window",
        name: "Open current note in new window",
        category: "Current note",
        icon: WindowIcon,
        action: "openCurrentNoteInNewWindow",
        keywords: ["window", "split", "side by side", "detach", "popout"],
      },
      {
        id: "copy-current-path",
        name: "Copy current note path",
        category: "Current note",
        icon: LinkIcon,
        action: "copyCurrentNotePath",
        keywords: ["clipboard", "file path"],
      },
      {
        id: "copy-current-wikilink",
        name: "Copy current note wiki link",
        category: "Current note",
        icon: BookmarkIcon,
        action: "copyCurrentNoteWikiLink",
        keywords: ["clipboard", "markdown", "link"],
      },
      {
        id: "toggle-current-pin",
        name: pinLabel,
        category: "Current note",
        icon: PinIcon,
        action: "toggleCurrentNotePin",
        keywords: ["favorite", "pinned"],
      },
    ];
  }, [currentNote, isPinned]);

  // Get all notes for navigation
  const notes = useMemo(() => items.filter((item) => item.type === "note"), [items]);
  const folderNames = useMemo(() => {
    const map = new Map();
    for (const item of items) if (item.type === "folder") map.set(item.id, item.name);
    return map;
  }, [items]);

  // A command's own shortcut, where it has one, as the trailing hint. Actions
  // and keymap ids share names for the commands that have both.
  const shortcutFor = (action) => {
    const keymap = keymaps?.[action];
    return keymap?.modifiers ? formatShortcutHint(keymap) : "";
  };

  const allItems = useMemo(
    () => [
      // Add commands with searchable fields
      ...commands.map((cmd) => ({
        ...cmd,
        searchText: `${cmd.name} ${cmd.category} ${cmd.keywords.join(" ")}`,
        type: "command",
      })),
      // Add notes
      ...notes.map((note) => ({
        ...note,
        // An HTML document is found by the words on its page, not its markup.
        searchText: `${note.name} ${documentText(note)}`,
        type: "note",
      })),
    ],
    [commands, notes]
  );

  const fuse = useMemo(
    () =>
      new Fuse(allItems, {
        keys: [
          { name: "name", weight: 3 },
          { name: "searchText", weight: 1 },
        ],
        includeScore: true,
        threshold: 0.3,
        ignoreLocation: true,
        minMatchCharLength: 1,
      }),
    [allItems]
  );

  // Perform search
  useEffect(() => {
    if (!query.trim()) {
      // Show all commands when no query
      // Grouped by category, in the order each category first appears, so
      // every group label shows once.
      const categoryOrder = [...new Set(commands.map((cmd) => cmd.category))];
      const commandResults = [...commands]
        .sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category))
        .map((cmd) => ({
          type: "command",
          item: cmd,
          score: 0,
        }));
      setResults(commandResults);
      setSelectedIndex(0);
      return;
    }

    const searchResults = fuse.search(query).slice(0, 15);
    setResults(searchResults);
    setSelectedIndex(0);
  }, [query, commands, fuse]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
      // Results are not cleared here: the search effect has already listed
      // every command for the empty query, and clearing them left the palette
      // blank until the first keystroke.
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, results, selectedIndex, onClose]);

  // Keep the selected row visible. Scrolling the list itself rather than
  // calling scrollIntoView: that walks every scrollable ancestor and drags the
  // app shell behind the palette along with it.
  useEffect(() => {
    if (results.length === 0) return;
    const container = resultsContainerRef.current;
    scrollItemIntoView(
      container,
      container?.querySelector(`#command-palette-result-${selectedIndex}`)
    );
  }, [selectedIndex, results.length]);

  const handleSelect = (result) => {
    const item = result.item || result;

    if (item.type === "note") {
      // Navigate to note
      if (onExecuteCommand) {
        onExecuteCommand({ action: "selectNote", payload: item.id });
      }
    } else if (item.type === "command") {
      // Execute command
      if (onExecuteCommand) {
        onExecuteCommand({ action: item.action });
      }
    }

    onClose();
  };

  if (!isOpen) return null;

  // Group labels sit between rows wherever the group changes. Results are
  // never reordered for them: with a query the ranking decides what Enter
  // opens, so a label may repeat rather than move a better match down.
  const groupOf = (result) => {
    const item = result.item || result;
    if (item.type === "note") return "Documents";
    return query.trim() ? "Commands" : item.category;
  };

  // Rendered into <body> so the overlay never inherits a transformed or
  // scrollable ancestor from the app layout.
  return createPortal(
    <>
      <div className="modal-scrim z-50 animate-fade-in" onClick={onClose} aria-hidden="true" />

      <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh] pb-4 pointer-events-none">
        <div
          ref={dialogRef}
          className="glass-panel modal-panel w-full max-w-[600px] max-h-[min(560px,100%)] flex flex-col pointer-events-auto animate-fade-in"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="command-palette-title"
          tabIndex={-1}
        >
          <h2 id="command-palette-title" className="sr-only">
            Command palette
          </h2>
          <div className="modal-query">
            <SearchIcon className="w-[18px] h-[18px]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes or run a command"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={results.length > 0}
              aria-label="Search commands and notes"
              aria-controls={resultsListboxId}
              aria-activedescendant={activeResultId}
              aria-describedby="command-palette-status"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="icon-btn"
                title="Clear"
                aria-label="Clear command search"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            )}
          </div>
          <div id="command-palette-status" className="sr-only" role="status" aria-live="polite">
            {results.length > 0
              ? `${results.length} result${results.length !== 1 ? "s" : ""}`
              : query
                ? "No results found"
                : "All commands"}
          </div>

          <div
            ref={resultsContainerRef}
            id={resultsListboxId}
            role="listbox"
            aria-label="Command palette results"
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2"
          >
            {results.length === 0 && query.trim() !== "" && (
              <EmptyState
                icon="search"
                title="No commands or notes match"
                body={`Nothing is called “${query.trim()}”. Try a shorter or different word.`}
              />
            )}

            {results.map((result, index) => {
              const item = result.item || result;
              const isSelected = index === selectedIndex;
              const isNote = item.type === "note";
              const group = groupOf(result);
              const showGroup = index === 0 || groupOf(results[index - 1]) !== group;
              const Glyph = isNote
                ? isHtmlDocument(item)
                  ? CodeDocumentIcon
                  : NoteIcon
                : item.icon;
              const shortcut = !isNote && shortcutFor(item.action);
              const folderName = isNote && item.parentId ? folderNames.get(item.parentId) : "";

              return (
                <div key={item.id} role="presentation">
                  {showGroup && (
                    <div className="palette-group" role="presentation" aria-hidden="true">
                      {group}
                    </div>
                  )}
                  <button
                    type="button"
                    id={`command-palette-result-${index}`}
                    onClick={() => handleSelect(result)}
                    tabIndex={-1}
                    role="option"
                    aria-selected={isSelected}
                    className={`palette-row ${isSelected ? "is-selected" : ""}`}
                    title={isNote ? documentExcerpt(item, 200) || "Empty note" : undefined}
                  >
                    {Glyph ? <Glyph /> : <span className="w-4" aria-hidden="true" />}
                    <span className="min-w-0 flex-1 truncate" dir="auto">
                      {item.name}
                    </span>
                    {shortcut ? (
                      <span className="kbd-hint">{shortcut}</span>
                    ) : folderName ? (
                      <span className="max-w-[40%] truncate text-[12px] text-text-muted" dir="auto">
                        {folderName}
                      </span>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

export default CommandPalette;
