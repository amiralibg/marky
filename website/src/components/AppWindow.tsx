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

See [[Graph]] and the new [[Inbox]] from yesterday.

- [x] Write in the live editor
- [ ] Follow backlinks

The vault is just a folder on disk.`,
    tags: ["daily"],
  },
  {
    id: "graph",
    name: "Graph.md",
    title: "Graph",
    source: `# Graph

Every [[Daily]] note is a node. Wiki links become edges.

Open the graph from the command palette when the vault grows past a handful of pages.

Back to [[Inbox]].`,
    tags: ["design", "graph"],
  },
  {
    id: "inbox",
    name: "Inbox.md",
    title: "Inbox",
    source: `# Inbox

Capture first. File later.

- Sketch for [[Graph]]
- Link from [[Daily]]

Nothing leaves this machine.`,
    tags: ["inbox"],
  },
  {
    id: "ideas",
    name: "Ideas.md",
    title: "Ideas",
    folder: "Projects",
    source: `# Ideas

Parked in [[Projects]].

- A quieter command palette
- Export the [[Graph]] as SVG`,
    tags: ["product"],
  },
];

type Mode = "source" | "live" | "read";

function FileIcon({ active }: { active?: boolean }) {
  return (
    <svg
      className={`size-3.5 shrink-0 ${active ? "text-accent-text" : "text-[var(--app-text-3)]"}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

/** Only the paths this mockup actually draws, kept inline to avoid a dependency. */
const ICON = {
  folder: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z",
  chevronDown: "m6 9 6 6 6-6",
  chevronRight: "m9 6 6 6-6 6",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zm9 16-3.5-3.5",
  home: "M4 10.5 12 4l8 6.5V19a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z",
  // Three nodes and their edges, which reads at 14px where a dense glyph does not.
  graph: [
    "M6.5 7.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
    "M17.5 7.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
    "M12 21.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
    "M9 5h6M7.6 7.2l3 9.6M16.4 7.2l-3 9.6",
  ],
  calendar: "M4 6a1 1 0 011-1h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1zM8 3v4m8-4v4M4 10h16",
  plus: "M12 5v14m7-7H5",
  sun: "M12 7a5 5 0 100 10 5 5 0 000-10zM12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  template: "M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1zM4 9h16M9 9v11",
  // Copied verbatim from the app's own Settings icon, so the mockup matches.
  settings: [
    "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
    "M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  ],
  link: "M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7",
} as const;

function Glyph({ d, className }: { d: string | readonly string[]; className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      {(Array.isArray(d) ? d : [d]).map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

/** The accent-tinted tag pills the real file tree shows beside a note. */
function TagChips({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null;
  return (
    <>
      {tags.map((tag) => (
        <span
          key={tag}
          className="shrink-0 rounded-sm bg-accent-dim px-1 py-px font-mono text-[9.5px] leading-4 text-accent-text"
        >
          #{tag}
        </span>
      ))}
    </>
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
        className={variant === "live" ? "marky-live-wiki" : "wikilink"}
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
    <div className="marky-live">
      {blocks.map((block, index) => {
        if (block.type === "blank") {
          return (
            <div
              key={index}
              className="marky-live-line"
              style={{ height: `${block.count * 1.6}em` }}
            />
          );
        }
        if (block.type === "heading") {
          const Tag = block.level === 1 ? "h1" : "h2";
          return (
            <Tag
              key={index}
              tabIndex={0}
              className={`marky-live-h marky-live-h${block.level === 1 ? "1" : "2"}`}
            >
              <span className="marky-live-hash" aria-hidden>
                {block.hashes}{" "}
              </span>
              {block.text}
            </Tag>
          );
        }
        if (block.type === "ul") {
          return (
            <div key={index}>
              {block.items.map((item) => (
                <div key={item.raw} className="marky-live-line">
                  -{" "}
                  {item.task ? (
                    <input
                      type="checkbox"
                      className="marky-live-task"
                      checked={item.checked}
                      aria-label={item.checked ? "Completed task" : "Task"}
                      onChange={() => onToggleTask(item.raw)}
                    />
                  ) : null}
                  {wikiInline(item.text, notes, onOpen, true, "live")}
                </div>
              ))}
            </div>
          );
        }
        return (
          <div key={index} className="marky-live-line whitespace-pre-wrap">
            {wikiInline(block.text, notes, onOpen, true, "live")}
          </div>
        );
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
    <div className="marky-read">
      {blocks.map((block, index) => {
        if (block.type === "blank") {
          return (
            <div
              key={index}
              className="marky-read-blank"
              style={{ height: `${block.count * 1.7}em` }}
            />
          );
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

export default function AppWindow() {
  const [notes, setNotes] = useState<Note[]>(STARTER);
  const [currentId, setCurrentId] = useState<NoteId>("daily");
  const [openIds, setOpenIds] = useState<NoteId[]>(["daily"]);
  const [mode, setMode] = useState<Mode>("live");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [scratchCount, setScratchCount] = useState(1);

  const note = notes.find((item) => item.id === currentId) ?? notes[0];

  const stats = useMemo(() => {
    const body = note.source;
    return {
      words: (body.match(/\S+/g) ?? []).length,
      characters: body.length,
      paragraphs: body.split(/\n\s*\n/).filter((block) => block.trim()).length,
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
    // flex column + a flex-1 body: the hero grid stretches this card to the
    // height of the copy beside it, and without this the body kept its content
    // height and left a bare strip of --app-editor showing at the bottom.
    <div className="marky-app relative flex h-full flex-col overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-editor)]">
      <div className="relative flex h-8 shrink-0 border-b border-[var(--app-border)] bg-[var(--app-titlebar)]">
        <div className="pointer-events-none absolute left-3 top-1/2 z-10 flex -translate-y-1/2 gap-1.5">
          <span className="size-2.5 rounded-pill bg-[#ff5f57]" />
          <span className="size-2.5 rounded-pill bg-[#febc2e]" />
          <span className="size-2.5 rounded-pill bg-[#28c840]" />
        </div>
        <div
          className={`flex shrink-0 items-center border-r border-[var(--app-border)] ${
            sidebarOpen ? "w-[200px] pl-[72px] pr-2" : "pl-[72px] pr-2"
          }`}
        >
          {sidebarOpen ? (
            <>
              <span className="text-[13px] font-semibold tracking-tight text-[var(--app-text)]">
                Marky
              </span>
              <div className="ml-auto flex">
                <button
                  type="button"
                  onClick={addNote}
                  className="rounded-sm p-1 text-[var(--app-text-2)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                  title="New note"
                >
                  <svg
                    className="size-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarOpen((open) => !open)}
                  className="rounded-sm p-1 text-[var(--app-text-2)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                  title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
                >
                  <svg
                    className="size-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-sm p-1 text-[var(--app-text-2)] hover:bg-[var(--app-hover)]"
              title="Show sidebar"
            >
              <svg
                className="size-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          )}
        </div>

        <div className="flex min-w-0 flex-1 overflow-x-auto">
          {openIds.map((id) => {
            const tab = notes.find((item) => item.id === id);
            if (!tab) return null;
            const active = id === currentId;
            return (
              <div
                key={id}
                className={`group flex h-8 min-w-[7.5rem] max-w-[12.5rem] shrink-0 items-center gap-2 border-r border-[var(--app-border)] px-3 ${
                  active
                    ? "bg-[var(--app-editor)] text-accent-text"
                    : "text-[var(--app-text-2)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => openNote(id)}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  <FileIcon active={active} />
                  <span className="truncate text-[12px] font-medium">{tab.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => closeTab(id)}
                  className={`rounded-sm p-0.5 hover:bg-[var(--app-hover)] ${
                    active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  aria-label={`Close ${tab.name}`}
                >
                  <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18 18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative flex min-h-[380px] flex-1 md:min-h-[460px]">
        {sidebarOpen && (
          <button
            type="button"
            className="absolute inset-0 z-10 bg-[rgb(28_27_24/0.28)] md:hidden"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          className={`${
            sidebarOpen ? "flex" : "hidden"
          } absolute inset-y-0 left-0 z-20 w-[200px] shrink-0 flex-col border-r border-[var(--app-border)] bg-[var(--app-sidebar)] md:static`}
        >
          <div className="flex items-center gap-2 px-2.5 py-2.5">
            <Glyph d={ICON.folder} className="size-4 shrink-0 text-[var(--app-text-2)]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-semibold text-[var(--app-text)]">
                {VAULT_NAME}
              </span>
              <span className="block truncate font-mono text-[10px] text-[var(--app-text-3)]">
                {VAULT_PATH}
              </span>
            </span>
            <Glyph d={ICON.chevronDown} className="size-3.5 shrink-0 text-[var(--app-text-3)]" />
          </div>

          <div className="px-2">
            <label className="sr-only" htmlFor="vault-search">
              Search notes
            </label>
            <div className="relative">
              <Glyph
                d={ICON.search}
                className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--app-text-3)]"
              />
              <input
                id="vault-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="w-full rounded-sm border border-[var(--app-border)] bg-[var(--app-editor)] py-1.5 pl-7 pr-8 text-[12px] text-[var(--app-text)] outline-none placeholder:text-[var(--app-text-3)]"
              />
              <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-[var(--app-text-3)]">
                ⌘K
              </kbd>
            </div>
          </div>

          <nav className="mt-1.5 px-1.5" aria-label="Workspace">
            {[
              { label: "Home", icon: ICON.home },
              { label: "Graph", icon: ICON.graph },
              { label: "Scheduled", icon: ICON.calendar },
            ].map((row) => (
              <span
                key={row.label}
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-[12.5px] text-[var(--app-text-2)]"
              >
                <Glyph d={row.icon} className="size-3.5 shrink-0 text-[var(--app-text-3)]" />
                {row.label}
              </span>
            ))}
          </nav>

          <div className="mt-2 flex items-center justify-between px-3 pb-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--app-text-3)]">
              Files
            </p>
            <button
              type="button"
              onClick={addNote}
              className="rounded-sm p-0.5 text-[var(--app-text-3)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
              title="New note"
            >
              <Glyph d={ICON.plus} className="size-3.5" />
            </button>
          </div>
          <ul className="flex-1 overflow-auto px-1.5 pb-3">
            {roots.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openNote(item.id)}
                  className={`flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-[12.5px] ${
                    item.id === currentId
                      ? "bg-[var(--app-hover)] font-medium text-[var(--app-text)]"
                      : "text-[var(--app-text-2)] hover:bg-[var(--app-hover)]"
                  }`}
                >
                  <FileIcon active={item.id === currentId} />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {linkCount(item.source) > 0 && (
                    <span className="flex shrink-0 items-center gap-0.5 font-mono text-[9.5px] text-[var(--app-text-3)]">
                      <Glyph d={ICON.link} className="size-2.5" />
                      {linkCount(item.source)}
                    </span>
                  )}
                  <TagChips tags={item.tags} />
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => setProjectsOpen((open) => !open)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] text-[var(--app-text-2)] hover:bg-[var(--app-hover)]"
              >
                <svg
                  className="size-3.5 text-[var(--app-text-3)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={
                      projectsOpen
                        ? "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                        : "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    }
                  />
                </svg>
                Projects
              </button>
              {projectsOpen &&
                nested.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openNote(item.id)}
                    className={`flex w-full items-center gap-2 rounded-sm py-1.5 pl-7 pr-2 text-left text-[13px] ${
                      item.id === currentId
                        ? "bg-[var(--app-hover)] font-medium text-[var(--app-text)]"
                        : "text-[var(--app-text-2)] hover:bg-[var(--app-hover)]"
                    }`}
                  >
                    <FileIcon active={item.id === currentId} />
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <TagChips tags={item.tags} />
                  </button>
                ))}
            </li>
          </ul>

          {/* The real sidebar pins a save-state line and three shortcuts here. */}
          <div className="mt-auto border-t border-[var(--app-border)] px-2 py-1.5">
            <div className="flex items-center gap-1.5 px-1 py-1">
              <span className="size-1.5 shrink-0 rounded-pill bg-[#3fb950]" />
              <span className="min-w-0 flex-1 truncate text-[10.5px] text-[var(--app-text-3)]">
                All changes saved locally
              </span>
              <span className="shrink-0 font-mono text-[9.5px] text-[var(--app-text-3)]">
                just now
              </span>
            </div>
            {[
              { label: "Light mode", icon: ICON.sun },
              { label: "Templates", icon: ICON.template },
              { label: "Settings", icon: ICON.settings },
            ].map((row) => (
              <span
                key={row.label}
                className="flex items-center gap-2 rounded-sm px-1 py-1 text-[11.5px] text-[var(--app-text-2)]"
              >
                <Glyph d={row.icon} className="size-3.5 shrink-0 text-[var(--app-text-3)]" />
                {row.label}
              </span>
            ))}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col bg-[var(--app-editor)]">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--app-border)] px-3 py-2">
            <button
              type="button"
              onClick={() => setSidebarOpen((open) => !open)}
              className="rounded-sm p-1.5 text-[var(--app-text-2)] hover:bg-[var(--app-hover)]"
              aria-label="Toggle notes"
            >
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <p className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--app-text-3)]">
              {VAULT_NAME}
              <span className="px-1">/</span>
              {note.folder && (
                <>
                  {note.folder}
                  <span className="px-1">/</span>
                </>
              )}
              <span className="text-[var(--app-text-2)]">{note.title}</span>
            </p>
            <div
              className="ml-auto flex items-center gap-0.5 rounded-sm bg-[var(--app-hover)] p-0.5"
              role="group"
              aria-label="Editor view"
            >
              {(["source", "live", "read"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  aria-pressed={mode === id}
                  className={`rounded-sm px-2.5 py-1 text-[12px] capitalize sm:px-[11px] sm:text-[13px] ${
                    mode === id
                      ? "bg-accent-dim font-semibold text-accent-text"
                      : "text-[var(--app-text-2)] hover:text-[var(--app-text)]"
                  }`}
                >
                  {id}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {mode === "source" ? (
              <textarea
                value={note.source}
                onChange={(event) => updateSource(event.target.value)}
                className="h-full min-h-[280px] w-full resize-none bg-transparent p-5 font-mono text-[13px] leading-7 text-[var(--app-text)] outline-none sm:p-8"
                spellCheck={false}
              />
            ) : mode === "live" ? (
              <LiveDoc note={note} notes={notes} onOpen={openNote} onToggleTask={toggleTask} />
            ) : (
              <ReadDoc note={note} notes={notes} onOpen={openNote} />
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3 border-t border-[var(--app-border)] px-3 py-1.5">
            <span className="font-mono text-[10px] font-semibold tracking-wide text-accent-text">
              NORMAL
            </span>
            <span className="ml-auto flex gap-3 font-mono text-[10px] text-[var(--app-text-3)]">
              <span>{stats.words} words</span>
              <span className="hidden sm:inline">{stats.characters} characters</span>
              <span className="hidden md:inline">{stats.paragraphs} paragraphs</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
