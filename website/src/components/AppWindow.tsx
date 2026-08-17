import { useMemo, useState } from "react";

type NoteId = string;

type Note = {
  id: NoteId;
  name: string;
  title: string;
  source: string;
  folder?: string;
};

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
  },
  {
    id: "graph",
    name: "Graph.md",
    title: "Graph",
    source: `# Graph

Every [[Daily]] note is a node. Wiki links become edges.

Open the graph from the command palette when the vault grows past a handful of pages.

Back to [[Inbox]].`,
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
  },
];

type Mode = "source" | "live" | "read";

function FileIcon({ active }: { active?: boolean }) {
  return (
    <svg
      className={`size-3.5 shrink-0 ${active ? "text-accent" : "text-[var(--app-text-3)]"}`}
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
    <div className="marky-app relative overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-editor)]">
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
                    ? "bg-[var(--app-editor)] text-accent"
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

      <div className="relative flex min-h-[380px] md:min-h-[460px]">
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
          <div className="p-2">
            <label className="sr-only" htmlFor="vault-search">
              Search notes
            </label>
            <input
              id="vault-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              className="w-full rounded-sm border border-[var(--app-border)] bg-[var(--app-editor)] px-2 py-1.5 text-[12px] text-[var(--app-text)] outline-none placeholder:text-[var(--app-text-3)]"
            />
          </div>
          <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--app-text-3)]">
            Workspace
          </p>
          <ul className="flex-1 overflow-auto px-1.5 pb-3">
            {roots.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openNote(item.id)}
                  className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] ${
                    item.id === currentId
                      ? "bg-[var(--app-hover)] font-medium text-[var(--app-text)]"
                      : "text-[var(--app-text-2)] hover:bg-[var(--app-hover)]"
                  }`}
                >
                  <FileIcon active={item.id === currentId} />
                  {item.name}
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
                    {item.name}
                  </button>
                ))}
            </li>
          </ul>
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
                      ? "bg-accent-dim font-semibold text-accent"
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
        </div>
      </div>
    </div>
  );
}
