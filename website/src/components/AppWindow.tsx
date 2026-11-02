import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  Code,
  FilePlus2,
  FileText,
  Folder,
  GitFork,
  Home,
  Link2,
  ListTree,
  Moon,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Plus,
  Search,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

type NoteId = string;

type Note = {
  id: NoteId;
  name: string;
  title: string;
  source: string;
  folder?: string;
  /** Shown as chips in the file tree, the way the real sidebar does. */
  tags?: string[];
};

const VAULT_NAME = "MarkyVault";
const VAULT_PATH = "~/Documents/MarkyVault";

const STARTER: Note[] = [
  {
    id: "daily",
    name: "Daily.md",
    title: "Daily",
    source: `# Daily

Picked up where [[Inbox]] left off yesterday, then went down a [[Graph]] rabbit hole.

- [x] Write in the live editor
- [ ] Follow the backlinks and see where they go

Reminder to self: this is a folder, not an app.`,
    tags: ["daily"],
  },
  {
    id: "graph",
    name: "Graph.md",
    title: "Graph",
    source: `# Graph

Every [[Daily]] note shows up as a node, and each wiki link becomes an edge between two of them.

Worth opening from the command palette once the vault is past a hundred pages or so. Before that it is mostly a pretty picture.

Back to [[Inbox]].`,
    tags: ["design", "graph"],
  },
  {
    id: "inbox",
    name: "Inbox.md",
    title: "Inbox",
    source: `# Inbox

Everything lands here first and gets filed on a Friday, if at all.

- Sketch for [[Graph]]
- Link back from [[Daily]]

None of it goes anywhere near a server.`,
    tags: ["inbox"],
  },
  {
    id: "ideas",
    name: "Ideas.md",
    title: "Ideas",
    folder: "Projects",
    source: `# Ideas

Parked in [[Projects]] until there is time.

- A quieter command palette
- Export the [[Graph]] as SVG`,
    tags: ["product"],
  },
];

type Mode = "source" | "live" | "read";

const EDGE = "border-[var(--app-border)]";

/** The toolbar's icon button, at the size the app uses. */
const ICON_BTN =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-[var(--app-text-2)] transition-colors duration-150 hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]";

const VIEW_ICON = { source: Code, live: Pencil, read: BookOpen } as const;

export type ReadingFont = "sans" | "serif" | "mixed";

/** The muted tags the real file tree shows beside a note. */
function TagLabel({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null;
  return (
    <span className="min-w-0 truncate font-mono text-[9.5px] text-[var(--app-text-3)]">
      #{tags[0]}
    </span>
  );
}

/** Outgoing wiki links, counted from the note body like the real sidebar does. */
function linkCount(source: string) {
  return new Set(Array.from(source.matchAll(/\[\[([^\]]+)\]\]/g), (m) => m[1].toLowerCase())).size;
}

type ListItem = {
  raw: string;
  text: string;
  task: boolean;
  checked: boolean;
};

type Block =
  | { type: "heading"; level: number; hashes: string; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: ListItem[] }
  | { type: "blank"; count: number };

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\n$/, "").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      let count = 1;
      i += 1;
      while (i < lines.length && lines[i].trim() === "") {
        count += 1;
        i += 1;
      }
      blocks.push({ type: "blank", count });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        hashes: heading[1],
        text: heading[2],
      });
      i += 1;
      continue;
    }
    if (/^\s*-\s/.test(line)) {
      const items: ListItem[] = [];
      while (i < lines.length && /^\s*-\s/.test(lines[i])) {
        const task = lines[i].match(/^\s*-\s\[([ xX])\]\s(.*)$/);
        if (task) {
          items.push({
            raw: lines[i],
            text: task[2],
            task: true,
            checked: task[1].toLowerCase() === "x",
          });
        } else {
          items.push({
            raw: lines[i],
            text: lines[i].replace(/^\s*-\s/, ""),
            task: false,
            checked: false,
          });
        }
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !/^\s*-\s/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "p", text: para.join("\n") });
  }
  return blocks;
}

function wikiInline(
  text: string,
  notes: Note[],
  onOpen: (id: NoteId) => void,
  interactive: boolean,
  variant: "live" | "read"
) {
  const parts = text.split(/(\[\[[^\]]+\]\])/g);
  return parts.map((part, index) => {
    const match = part.match(/^\[\[([^\]]+)\]\]$/);
    if (!match) return <span key={index}>{part}</span>;
    const label = match[1];
    const target = notes.find(
      (note) =>
        note.title.toLowerCase() === label.toLowerCase() ||
        note.name.replace(/\.md$/i, "").toLowerCase() === label.toLowerCase() ||
        note.folder?.toLowerCase() === label.toLowerCase()
    );
    const link = (
      <button
        type="button"
        disabled={!interactive || !target}
        onClick={() => target && onOpen(target.id)}
        className="marky-link"
      >
        {label}
      </button>
    );
    if (variant === "read") return <span key={index}>{link}</span>;
    return (
      <span key={index} className="whitespace-nowrap">
        <span className="marky-live-bracket">[[</span>
        {link}
        <span className="marky-live-bracket">]]</span>
      </span>
    );
  });
}

function LiveDoc({
  note,
  notes,
  onOpen,
  onToggleTask,
}: {
  note: Note;
  notes: Note[];
  onOpen: (id: NoteId) => void;
  onToggleTask: (line: string) => void;
}) {
  const blocks = parseBlocks(note.source);
  return (
    <div className="marky-doc marky-live">
      {blocks.map((block, index) => {
        if (block.type === "blank") {
          return <div key={index} className="marky-blank" />;
        }
        if (block.type === "heading") {
          const Tag = block.level === 1 ? "h1" : "h2";
          return (
            <Tag key={index}>
              <span className="marky-live-hash" aria-hidden>
                {block.hashes}
              </span>
              {block.text}
            </Tag>
          );
        }
        if (block.type === "ul") {
          return (
            <ul key={index}>
              {block.items.map((item) => (
                <li
                  key={item.raw}
                  className={item.task ? `task${item.checked ? " done" : ""}` : undefined}
                >
                  <span className="marky-live-dash" aria-hidden>
                    -
                  </span>
                  {item.task ? (
                    <input
                      type="checkbox"
                      checked={item.checked}
                      aria-label={item.checked ? "Completed task" : "Task"}
                      onChange={() => onToggleTask(item.raw)}
                    />
                  ) : null}
                  {wikiInline(item.text, notes, onOpen, true, "live")}
                </li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{wikiInline(block.text, notes, onOpen, true, "live")}</p>;
      })}
    </div>
  );
}

function ReadDoc({
  note,
  notes,
  onOpen,
}: {
  note: Note;
  notes: Note[];
  onOpen: (id: NoteId) => void;
}) {
  const blocks = parseBlocks(note.source);
  return (
    <div className="marky-doc marky-read">
      {blocks.map((block, index) => {
        if (block.type === "blank") {
          return <div key={index} className="marky-blank" />;
        }
        if (block.type === "heading") {
          const Tag = block.level === 1 ? "h1" : "h2";
          return <Tag key={index}>{block.text}</Tag>;
        }
        if (block.type === "ul") {
          return (
            <ul key={index}>
              {block.items.map((item) => (
                <li
                  key={item.raw}
                  className={item.task ? `task${item.checked ? " done" : ""}` : undefined}
                >
                  {item.task ? (
                    <input
                      type="checkbox"
                      checked={item.checked}
                      readOnly
                      tabIndex={-1}
                      aria-hidden
                    />
                  ) : null}
                  {wikiInline(item.text, notes, onOpen, true, "read")}
                </li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{wikiInline(block.text, notes, onOpen, true, "read")}</p>;
      })}
    </div>
  );
}

function TreeRow({
  note,
  current,
  depth,
  onOpen,
}: {
  note: Note;
  current: boolean;
  depth: number;
  onOpen: (id: NoteId) => void;
}) {
  const links = linkCount(note.source);
  return (
    <button
      type="button"
      onClick={() => onOpen(note.id)}
      style={{ paddingInlineStart: `${8 + depth * 12}px` }}
      className={`flex min-h-7 w-full items-center gap-1.5 rounded-sm pr-2 text-left text-[12.5px] transition-colors duration-150 ${
        current
          ? "bg-[var(--app-raised)] font-medium text-[var(--app-text)]"
          : "text-[var(--app-text-2)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
      }`}
    >
      <FileText size={13} strokeWidth={1.75} className="shrink-0 text-[var(--app-text-3)]" />
      <span className="min-w-0 truncate">{note.title}</span>
      <span className="ml-auto flex min-w-0 items-center gap-1.5">
        {links > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 font-mono text-[9.5px] text-[var(--app-text-3)]">
            <Link2 size={10} strokeWidth={2} aria-hidden />
            {links}
          </span>
        )}
        <TagLabel tags={note.tags} />
      </span>
    </button>
  );
}

export default function AppWindow({ readingFont = "sans" }: { readingFont?: ReadingFont }) {
  const [notes, setNotes] = useState<Note[]>(STARTER);
  const [currentId, setCurrentId] = useState<NoteId>("daily");
  const [openIds, setOpenIds] = useState<NoteId[]>(["daily"]);
  const [mode, setMode] = useState<Mode>("live");
  // On a phone the sidebar would open over the note it is there to show off.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === "undefined" || window.matchMedia("(min-width: 768px)").matches
  );
  const [query, setQuery] = useState("");
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [scratchCount, setScratchCount] = useState(1);

  const note = notes.find((item) => item.id === currentId) ?? notes[0];

  const stats = useMemo(() => {
    const body = note.source;
    return {
      words: (body.match(/\S+/g) ?? []).length,
      characters: body.length,
    };
  }, [note.source]);
  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      q
        ? notes.filter(
            (item) => item.name.toLowerCase().includes(q) || item.source.toLowerCase().includes(q)
          )
        : notes,
    [notes, q]
  );
  const roots = visible.filter((item) => !item.folder);
  const nested = visible.filter((item) => item.folder === "Projects");

  const openNote = (id: NoteId) => {
    setCurrentId(id);
    setOpenIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
  };

  const closeTab = (id: NoteId) => {
    setOpenIds((ids) => {
      const next = ids.filter((item) => item !== id);
      if (id === currentId) setCurrentId(next[next.length - 1] ?? notes[0].id);
      return next.length ? next : [notes[0].id];
    });
  };

  const updateSource = (value: string) => {
    setNotes((all) =>
      all.map((item) => {
        if (item.id !== currentId) return item;
        const heading = value.match(/^#\s+(.+)$/m);
        return {
          ...item,
          source: value,
          title: heading ? heading[1].trim() : item.title,
        };
      })
    );
  };

  const toggleTask = (line: string) => {
    const next = line.includes("[x]") ? line.replace("[x]", "[ ]") : line.replace("[ ]", "[x]");
    updateSource(note.source.replace(line, next));
  };

  const addNote = () => {
    const n = scratchCount;
    setScratchCount((count) => count + 1);
    const id = `scratch-${n}`;
    const created: Note = {
      id,
      name: n === 1 ? "Scratch.md" : `Scratch ${n}.md`,
      title: n === 1 ? "Scratch" : `Scratch ${n}`,
      source: `# ${n === 1 ? "Scratch" : `Scratch ${n}`}\n\nA new note.\n\nLink it from [[Daily]].`,
    };
    setNotes((all) => [...all, created]);
    openNote(id);
    setMode("source");
  };

  return (
    <div
      data-reading-font={readingFont}
      className="marky-app relative flex h-[min(680px,78vh)] min-h-[440px] flex-col overflow-hidden rounded-md border border-[var(--app-border-strong)] bg-[var(--app-sidebar)]"
    >
      {/* One bar: the sidebar's tools, the tabs, the view switch and the menu. */}
      <div className="flex h-10 shrink-0 items-center">
        <div
          className={`flex shrink-0 items-center gap-0.5 pl-3 pr-2 ${sidebarOpen ? "md:w-[232px]" : ""}`}
        >
          <span className="pointer-events-none mr-auto hidden gap-2 pr-3 sm:flex" aria-hidden>
            <span className="size-3 rounded-pill bg-[#ff5f57]" />
            <span className="size-3 rounded-pill bg-[#febc2e]" />
            <span className="size-3 rounded-pill bg-[#28c840]" />
          </span>
          {sidebarOpen && (
            <button type="button" onClick={addNote} className={ICON_BTN} aria-label="New note">
              <Plus size={14} strokeWidth={1.75} aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            className={ICON_BTN}
            aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            aria-pressed={sidebarOpen}
          >
            <PanelLeft size={14} strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pl-1 [scrollbar-width:none]">
          {openIds.map((id) => {
            const tab = notes.find((item) => item.id === id);
            if (!tab) return null;
            const active = id === currentId;
            return (
              <div
                key={id}
                className={`group flex h-7 max-w-[11rem] shrink-0 items-center gap-1 rounded-sm border pl-2.5 pr-1 text-[12px] transition-colors duration-150 ${
                  active
                    ? "border-[var(--app-border)] bg-[var(--app-raised)] font-semibold text-[var(--app-text)]"
                    : "border-transparent text-[var(--app-text-2)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => openNote(id)}
                  className="min-w-0 truncate"
                  aria-current={active ? "page" : undefined}
                >
                  {tab.title}
                </button>
                <button
                  type="button"
                  onClick={() => closeTab(id)}
                  className={`inline-flex size-5 shrink-0 items-center justify-center rounded-sm hover:bg-[var(--app-hover)] focus-visible:opacity-100 ${
                    active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  aria-label={`Close ${tab.title}`}
                >
                  <X size={11} strokeWidth={2} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-1 pl-2 pr-2">
          <div
            className="flex items-center gap-0.5 rounded-sm bg-[var(--app-hover)] p-0.5"
            role="group"
            aria-label="Editor view"
          >
            {(["source", "live", "read"] as const).map((id) => {
              const Icon = VIEW_ICON[id];
              const selected = mode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  aria-pressed={selected}
                  aria-label={id}
                  className={`inline-flex h-6 items-center gap-1.5 rounded-[5px] border px-2 text-[11.5px] capitalize transition-colors duration-150 ${
                    selected
                      ? "border-[var(--app-border)] bg-[var(--app-raised)] font-semibold text-[var(--app-text)]"
                      : "border-transparent text-[var(--app-text-2)] hover:text-[var(--app-text)]"
                  }`}
                >
                  <Icon
                    size={12}
                    strokeWidth={1.75}
                    className={selected ? "text-accent-text" : undefined}
                    aria-hidden
                  />
                  <span className="hidden lg:inline">{id}</span>
                </button>
              );
            })}
          </div>
          <span className={`${ICON_BTN} hidden sm:inline-flex`} aria-hidden>
            <MoreHorizontal size={14} strokeWidth={1.75} />
          </span>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {sidebarOpen && (
          <button
            type="button"
            className="absolute inset-0 z-10 bg-dusk/30 md:hidden"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          className={`${
            sidebarOpen ? "flex" : "hidden"
          } absolute inset-y-0 left-0 z-20 w-[232px] shrink-0 flex-col bg-[var(--app-sidebar)] md:static`}
        >
          <div className="flex items-center gap-2 px-3 pb-2 pt-1">
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-sm border ${EDGE} text-[var(--app-text-2)]`}
            >
              <Folder size={13} strokeWidth={1.75} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-semibold leading-4 text-[var(--app-text)]">
                {VAULT_NAME}
              </span>
              <span className="block truncate font-mono text-[9.5px] leading-3.5 text-[var(--app-text-2)]">
                {VAULT_PATH}
              </span>
            </span>
            <ChevronDown size={13} className="shrink-0 text-[var(--app-text-3)]" aria-hidden />
          </div>

          <div className="px-2.5">
            <label className="sr-only" htmlFor="vault-search">
              Search notes
            </label>
            <div className="relative">
              <Search
                size={12}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--app-text-3)]"
                aria-hidden
              />
              <input
                id="vault-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="w-full rounded-sm bg-[var(--app-raised)] py-1.5 pl-7 pr-10 text-[16px] text-[var(--app-text)] outline-none placeholder:text-[var(--app-text-2)] focus:ring-1 focus:ring-[var(--app-border-strong)] md:text-[12px]"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9.5px] text-[var(--app-text-3)]">
                Filter
              </span>
            </div>
          </div>

          <div className="mt-2 px-2.5" aria-hidden>
            {[
              { label: "Home", Icon: Home },
              { label: "Graph", Icon: GitFork },
            ].map(({ label, Icon }) => (
              <span
                key={label}
                className="flex min-h-7 items-center gap-2 px-2 text-[12.5px] text-[var(--app-text-2)]"
              >
                <Icon size={13} strokeWidth={1.75} className="text-[var(--app-text-3)]" />
                {label}
              </span>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between px-4 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--app-text-2)]">
              Files
            </p>
            <button
              type="button"
              onClick={addNote}
              className="inline-flex size-5 items-center justify-center rounded-sm text-[var(--app-text-3)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
              aria-label="Add a note"
            >
              <FilePlus2 size={12} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-2.5 pb-2 [scrollbar-width:none]">
            {roots.map((item) => (
              <TreeRow
                key={item.id}
                note={item}
                current={item.id === currentId}
                depth={0}
                onOpen={openNote}
              />
            ))}
            <button
              type="button"
              onClick={() => setProjectsOpen((open) => !open)}
              aria-expanded={projectsOpen}
              className="flex min-h-7 w-full items-center gap-1.5 rounded-sm px-2 text-left text-[12.5px] text-[var(--app-text-2)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
            >
              <Folder
                size={13}
                strokeWidth={1.75}
                className="shrink-0 text-[var(--app-text-3)]"
                aria-hidden
              />
              Projects
            </button>
            {projectsOpen &&
              nested.map((item) => (
                <TreeRow
                  key={item.id}
                  note={item}
                  current={item.id === currentId}
                  depth={1}
                  onOpen={openNote}
                />
              ))}
          </div>

          {/* Save state beside one row of icons, as the app has it. */}
          <div className="flex items-center gap-1.5 px-4 py-2.5" aria-hidden>
            <span className="size-1.5 shrink-0 rounded-pill bg-[#3fb950]" />
            <span className="mr-auto text-[10.5px] text-[var(--app-text-2)]">Saved</span>
            <span className="flex items-center gap-2.5 text-[var(--app-text-3)]">
              <ListTree size={12} strokeWidth={1.75} />
              <CalendarDays size={12} strokeWidth={1.75} />
              <Moon size={12} strokeWidth={1.75} className="dark-hide" />
              <Sun size={12} strokeWidth={1.75} className="light-hide" />
              <Settings size={12} strokeWidth={1.75} />
            </span>
          </div>
        </aside>

        {/* The sheet: one tone off the desk, a hairline edge, a single corner. */}
        <div
          className={`flex min-w-0 flex-1 flex-col border-t ${EDGE} bg-[var(--app-editor)] ${
            sidebarOpen ? "md:rounded-tl-md md:border-l" : ""
          }`}
        >
          <div className="min-h-0 flex-1 overflow-auto [scrollbar-width:thin]">
            {mode === "source" ? (
              <textarea
                value={note.source}
                onChange={(event) => updateSource(event.target.value)}
                aria-label={`Markdown source of ${note.title}`}
                className="mx-auto block h-full w-full max-w-[38rem] resize-none bg-transparent px-6 py-6 font-mono text-[13.5px] leading-[1.75] text-[var(--app-text)] outline-none sm:px-10 sm:py-10"
                spellCheck={false}
              />
            ) : mode === "live" ? (
              <LiveDoc note={note} notes={notes} onOpen={openNote} onToggleTask={toggleTask} />
            ) : (
              <ReadDoc note={note} notes={notes} onOpen={openNote} />
            )}
          </div>

          <div className="flex h-8 shrink-0 items-center gap-3 px-4 text-[10.5px] text-[var(--app-text-2)]">
            <p className="min-w-0 truncate">
              {VAULT_NAME}
              <span className="px-1 text-[var(--app-text-3)]">/</span>
              {note.folder && (
                <>
                  {note.folder}
                  <span className="px-1 text-[var(--app-text-3)]">/</span>
                </>
              )}
              <span className="text-[var(--app-text)]">{note.title}</span>
            </p>
            <span
              className="ml-auto flex shrink-0 gap-3 tabular-nums"
              title={`${stats.characters} characters`}
            >
              <span>{stats.words} words</span>
              <span>{Math.max(1, Math.round(stats.words / 220))} min read</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
