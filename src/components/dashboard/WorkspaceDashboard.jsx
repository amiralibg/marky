import { useMemo, useState } from "react";
import useNotesStore from "../../store/notesStore";
import useUIStore from "../../store/uiStore";
import { calculateWorkspaceStats, countWords } from "../../utils/workspaceStats";

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

const todayLabel = () =>
  new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

const formatDate = (isoString) => {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const formatRelativeDate = (isoString) => {
  if (!isoString) return "No activity yet";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "No activity yet";

  const today = new Date();
  const diffMs = today.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatDate(isoString);
};

const NewNoteIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      d="M6.25 4.5h8.5L19.5 9.25v8.5A1.75 1.75 0 0 1 17.75 19.5H6.25a1.75 1.75 0 0 1-1.75-1.75V6.25A1.75 1.75 0 0 1 6.25 4.5Z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      d="M14.75 4.75V8a1.25 1.25 0 0 0 1.25 1.25h3.25M8.5 13h5M8.5 16h7"
      opacity="0.65"
    />
  </svg>
);

const NewFolderIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      d="M3.75 7.75A2.25 2.25 0 0 1 6 5.5h3.25l2 2H18A2.25 2.25 0 0 1 20.25 9.75v6.5A2.25 2.25 0 0 1 18 18.5H6a2.25 2.25 0 0 1-2.25-2.25v-8.5Z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 11v4M10 13h4" />
  </svg>
);

const DailyNoteIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      d="M7.25 4.75v2.5M16.75 4.75v2.5M5.25 8.75h13.5M6.5 6h11A1.75 1.75 0 0 1 19.25 7.75v9.75A1.75 1.75 0 0 1 17.5 19.25h-11a1.75 1.75 0 0 1-1.75-1.75V7.75A1.75 1.75 0 0 1 6.5 6Z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 13h6M9 16h3" />
  </svg>
);

const QuickStart = ({ label, icon: Icon, onClick, primary = false }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
      primary
        ? "border-border bg-bg-editor text-text-primary hover:bg-overlay-subtle"
        : "border-transparent text-text-secondary hover:bg-overlay-subtle hover:text-text-primary"
    }`}
  >
    <span className={primary ? "text-accent" : "text-text-muted"}>
      <Icon />
    </span>
    {label}
  </button>
);

const NoteButton = ({ note, meta, onClick }) => (
  <button
    onClick={onClick}
    className="w-full text-left rounded-xl border border-transparent bg-overlay-subtle/45 px-3 py-2.5 hover:border-overlay-light hover:bg-overlay-subtle transition-colors group"
    title={note.filePath || note.name}
  >
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-text-primary truncate group-hover:text-accent">
        {note.name}
      </span>
      {meta && <span className="text-[11px] text-text-muted shrink-0">{meta}</span>}
    </div>
  </button>
);

const StatCard = ({ label, value, description }) => (
  <div className="rounded-2xl border border-overlay-subtle bg-bg-base/60 px-4 py-4">
    <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">{label}</p>
    <p className="mt-1 text-2xl font-bold text-text-primary">{value}</p>
    {description && <p className="mt-1 text-xs text-text-muted">{description}</p>}
  </div>
);

const EmptyInsight = ({ children }) => (
  <p className="rounded-xl border border-dashed border-overlay-light bg-overlay-subtle/30 px-3 py-3 text-sm text-text-muted">
    {children}
  </p>
);

const TabButton = ({ isActive, children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
      isActive
        ? "bg-accent text-white shadow-lg shadow-accent/10"
        : "text-text-muted hover:bg-overlay-subtle hover:text-text-primary"
    }`}
  >
    {children}
  </button>
);

const WorkspaceDashboard = () => {
  const {
    items,
    rootFolderPath,
    createNote,
    createFolder,
    createDailyNote,
    selectNote,
    getRecentNotes,
    getPinnedNotes,
  } = useNotesStore();
  const { addNotification, setShowWorkspaceModal } = useUIStore();
  const [activeTab, setActiveTab] = useState("overview");

  const hasWorkspace = Boolean(rootFolderPath);
  const notes = useMemo(() => items.filter((item) => item.type === "note"), [items]);
  const folderCount = useMemo(
    () => Math.max(0, items.filter((item) => item.type === "folder").length - 1),
    [items]
  );
  const pinnedNotes = useMemo(() => getPinnedNotes().slice(0, 4), [getPinnedNotes, items]);
  const recentNotes = useMemo(() => getRecentNotes().slice(0, 4), [getRecentNotes, items]);
  const wordCount = useMemo(
    () => notes.reduce((total, note) => total + countWords(note.content || ""), 0),
    [notes]
  );
  const stats = useMemo(() => calculateWorkspaceStats(notes), [notes]);

  const handleCreateNote = async () => {
    try {
      await createNote();
      addNotification("New note created", "success");
    } catch (error) {
      addNotification(`Failed to create note: ${error.message}`, "error");
    }
  };

  const handleCreateFolder = async () => {
    try {
      await createFolder();
      addNotification("New folder created", "success");
    } catch (error) {
      addNotification(`Failed to create folder: ${error.message}`, "error");
    }
  };

  const handleCreateDailyNote = async () => {
    try {
      await createDailyNote();
      addNotification("Daily note ready", "success");
    } catch (error) {
      addNotification(`Failed to create daily note: ${error.message}`, "error");
    }
  };

  if (!hasWorkspace) {
    return (
      <div className="h-full overflow-hidden bg-editor-bg relative">
        <main className="relative z-10 flex h-full items-center justify-center px-6">
          <section className="w-full max-w-xl rounded-3xl border border-overlay-subtle bg-bg-base/75 p-7 text-center shadow-2xl shadow-black/10 backdrop-blur md:p-9">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-3xl text-accent">
              📁
            </div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-accent">
              No Workspace Selected
            </p>
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-text-primary md:text-4xl">
              Choose a root folder first.
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-text-secondary">
              Marky stores notes directly in a local folder. Pick the folder you want to use as your
              workspace, then you can create notes and folders inside it.
            </p>
            <button
              onClick={() => setShowWorkspaceModal(true)}
              className="mt-7 inline-flex items-center justify-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-bold text-white shadow-lg shadow-accent/15 transition-all hover:-translate-y-0.5 hover:bg-accent/90 hover:shadow-xl"
            >
              <span>Open Root Folder</span>
              <span aria-hidden="true">→</span>
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-y-auto bg-editor-bg custom-scrollbar">
      <main className="relative z-10 max-w-5xl mx-auto px-6 py-10 md:py-14">
        <section>
          <div className="text-center">
            <h1 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight text-text-primary">
              {greeting()}
            </h1>
            <p className="text-sm text-text-muted mt-2">{todayLabel()}</p>
          </div>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-2">
            <QuickStart icon={NewNoteIcon} label="New page" onClick={handleCreateNote} primary />
            <QuickStart icon={DailyNoteIcon} label="Daily note" onClick={handleCreateDailyNote} />
            <QuickStart icon={NewFolderIcon} label="New folder" onClick={handleCreateFolder} />
          </div>

          <div className="mt-8 flex items-center justify-center gap-5 text-xs text-text-muted font-mono">
            <span>{notes.length} notes</span>
            <span>{folderCount} folders</span>
            <span>{wordCount.toLocaleString()} words</span>
          </div>
        </section>

        <div
          className="mt-10 flex justify-center"
          role="tablist"
          aria-label="Workspace dashboard sections"
        >
          <div className="inline-flex rounded-xl border border-border bg-bg-editor p-1">
            <TabButton isActive={activeTab === "overview"} onClick={() => setActiveTab("overview")}>
              Overview
            </TabButton>
            <TabButton isActive={activeTab === "stats"} onClick={() => setActiveTab("stats")}>
              Stats
            </TabButton>
          </div>
        </div>

        {activeTab === "overview" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
            <section className="rounded-2xl border border-border bg-bg-editor p-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted mb-3">
                Pinned
              </h2>
              {pinnedNotes.length > 0 ? (
                <div className="space-y-2">
                  {pinnedNotes.map((note) => (
                    <NoteButton key={note.id} note={note} onClick={() => selectNote(note.id)} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted">Pin notes to keep them one click away.</p>
              )}
            </section>

            <section className="rounded-2xl border border-overlay-subtle bg-bg-base/60 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted mb-3">
                Recent
              </h2>
              {recentNotes.length > 0 ? (
                <div className="space-y-2">
                  {recentNotes.map((note) => (
                    <NoteButton
                      key={note.id}
                      note={note}
                      meta={formatDate(note.lastOpenedAt)}
                      onClick={() => selectNote(note.id)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted">Open a note and it will appear here.</p>
              )}
            </section>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mt-5 md:grid-cols-4">
              {[
                ["Notes", notes.length],
                ["Folders", folderCount],
                ["Words", wordCount.toLocaleString()],
                ["Links", stats.wikiLinkCount.toLocaleString()],
              ].map(([label, value]) => (
                <StatCard key={label} label={label} value={value} />
              ))}
            </div>

            <section className="mt-5 rounded-2xl border border-overlay-subtle bg-bg-base/60 p-4">
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Workspace Stats
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    Health signals from tags, wiki links, and recent activity.
                  </p>
                </div>
                <p className="text-xs text-text-muted">
                  Last updated {formatRelativeDate(stats.latestUpdatedAt)}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <StatCard
                  label="Updated This Week"
                  value={stats.recentlyUpdatedCount.toLocaleString()}
                  description="Notes edited in the last 7 days"
                />
                <StatCard
                  label="Broken Links"
                  value={stats.brokenLinkCount.toLocaleString()}
                  description="Unresolved wiki-link targets"
                />
                <StatCard
                  label="Orphan Notes"
                  value={stats.orphanCount.toLocaleString()}
                  description="No incoming or outgoing wiki links"
                />
              </div>

              <div className="mt-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Top Tags
                </h3>
                {stats.topTags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {stats.topTags.map(({ tag, count }) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-2 rounded-full border border-overlay-light bg-overlay-subtle px-3 py-1 text-xs text-text-secondary"
                      >
                        <span className="font-semibold text-accent">#{tag}</span>
                        <span className="text-text-muted">{count}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <EmptyInsight>
                    Add tags like #project or #idea to see your top workspace themes.
                  </EmptyInsight>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default WorkspaceDashboard;
