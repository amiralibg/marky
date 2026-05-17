import { useMemo } from "react";
import useNotesStore from "../../store/notesStore";
import useUIStore from "../../store/uiStore";

const countWords = (text = "") => text.trim().split(/\s+/).filter(Boolean).length;

const formatDate = (isoString) => {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

const ActionButton = ({ title, description, icon: Icon, variant = "primary", onClick }) => {
  const isPrimary = variant === "primary";

  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-xl ${
        isPrimary
          ? "border-accent/30 bg-accent text-white shadow-lg shadow-accent/15"
          : "border-overlay-light bg-overlay-subtle text-text-primary hover:bg-overlay-light"
      }`}
    >
      <div
        className={`absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100 ${
          isPrimary
            ? "bg-linear-to-br from-white/20 via-transparent to-black/10"
            : "bg-linear-to-br from-white/5 via-transparent to-accent/10"
        }`}
      />
      <div className="relative flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg ${
            isPrimary ? "bg-white/20 text-white" : "bg-accent/10 text-accent"
          }`}
        >
          <Icon />
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-bold ${isPrimary ? "text-white" : "text-text-primary"}`}>
            {title}
          </p>
          <p
            className={`mt-1 text-xs leading-relaxed ${isPrimary ? "text-white/75" : "text-text-muted"}`}
          >
            {description}
          </p>
        </div>
      </div>
    </button>
  );
};

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

const WorkspaceDashboard = () => {
  const {
    items,
    rootFolderPath,
    createNote,
    createFolder,
    selectNote,
    getRecentNotes,
    getPinnedNotes,
  } = useNotesStore();
  const { addNotification, setShowWorkspaceModal } = useUIStore();

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

  if (!hasWorkspace) {
    return (
      <div className="h-full overflow-hidden bg-editor-bg relative">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-12rem] right-[-10rem] h-[34rem] w-[34rem] rounded-full bg-accent/10 blur-[120px]" />
          <div className="absolute bottom-[-14rem] left-[-10rem] h-[30rem] w-[30rem] rounded-full bg-emerald-500/10 blur-[110px]" />
        </div>

        <main className="relative z-10 flex h-full items-center justify-center px-6">
          <section className="w-full max-w-xl rounded-3xl border border-overlay-subtle bg-bg-base/75 p-7 text-center shadow-2xl shadow-black/10 backdrop-blur md:p-9">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-3xl text-accent">
              📁
            </div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-accent">
              No Workspace Selected
            </p>
            <h1 className="text-3xl font-black tracking-tight text-text-primary md:text-4xl">
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
    <div className="h-full overflow-y-auto bg-editor-bg relative custom-scrollbar">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 right-[-8rem] w-[34rem] h-[34rem] rounded-full bg-accent/10 blur-[120px]" />
        <div className="absolute bottom-[-10rem] left-[-8rem] w-[28rem] h-[28rem] rounded-full bg-emerald-500/10 blur-[110px]" />
      </div>

      <main className="relative z-10 max-w-4xl mx-auto px-6 py-10 md:py-14">
        <section className="rounded-3xl border border-overlay-subtle bg-bg-base/70 backdrop-blur p-6 md:p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent mb-3">
            Workspace Home
          </p>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-text-primary">
            Ready when you are.
          </h1>
          <p className="text-sm text-text-secondary mt-3 max-w-2xl leading-relaxed">
            Open a recent note, start something new, or make a folder to keep the workspace tidy.
          </p>

          <p className="text-xs text-text-muted mt-4 truncate" title={rootFolderPath}>
            {rootFolderPath}
          </p>

          <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ActionButton
              title="New Note"
              description="Create a fresh markdown note in the workspace root."
              icon={NewNoteIcon}
              onClick={handleCreateNote}
            />
            <ActionButton
              title="New Folder"
              description="Add a folder for projects, journals, or reference notes."
              icon={NewFolderIcon}
              variant="secondary"
              onClick={handleCreateFolder}
            />
          </div>
        </section>

        <div className="grid grid-cols-3 gap-3 mt-5">
          {[
            ["Notes", notes.length],
            ["Folders", folderCount],
            ["Words", wordCount.toLocaleString()],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-overlay-subtle bg-bg-base/60 px-4 py-4"
            >
              <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">{label}</p>
              <p className="text-2xl font-bold text-text-primary mt-1">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          <section className="rounded-2xl border border-overlay-subtle bg-bg-base/60 p-4">
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
      </main>
    </div>
  );
};

export default WorkspaceDashboard;
