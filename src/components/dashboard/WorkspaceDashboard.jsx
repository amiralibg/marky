import { useMemo } from "react";
import useNotesStore from "../../store/notesStore";
import useUIStore from "../../store/uiStore";
import { countWords } from "../../utils/workspaceStats";
import { notePreview } from "../../utils/notePreview";
import { FolderIcon } from "../icons";

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

const NewPageIcon = () => (
  <svg
    className="w-[15px] h-[15px]"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const TemplatesIcon = () => (
  <svg
    className="w-[15px] h-[15px]"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M9 21V9" />
  </svg>
);

const NewFolderIcon = () => (
  <svg
    className="w-[15px] h-[15px]"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
  </svg>
);

const RepeatIcon = () => (
  <svg
    className="w-[15px] h-[15px]"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11V9a4 4 0 014-4h14" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 01-4 4H3" />
  </svg>
);

const QuickStart = ({ label, icon: Icon, onClick, primary = false }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 rounded-[9px] px-4 py-[9px] text-[13.5px] transition-colors ${
      primary
        ? "border border-border bg-bg-editor font-medium text-text-primary hover:bg-overlay-subtle"
        : "border border-transparent text-text-secondary hover:bg-overlay-subtle hover:text-text-primary"
    }`}
  >
    <span className={primary ? "text-accent" : "text-text-muted"}>
      <Icon />
    </span>
    {label}
  </button>
);

const RecentCard = ({ note, date, onClick }) => {
  // The note's own opening lines, not a skeleton. Cheap: the vault already
  // holds the content, and the excerpt is memoized per card.
  //
  // `null` means the workspace read hasn't landed yet, which is different from
  // an empty file — only the latter deserves "Empty note".
  const isLoading = note.content == null;
  const preview = useMemo(() => notePreview(note.content, 160), [note.content]);

  return (
    <button
      onClick={onClick}
      className="group overflow-hidden rounded-xl border border-border bg-bg-editor p-0 text-left transition-colors hover:border-text-muted"
      title={note.filePath || note.name}
    >
      {/* `dir="auto"` so a Persian note reads right-aligned in its own card.
          The fade at the bottom keeps a clipped third line from ending on a
          hard cut. */}
      <div className="relative h-[70px] overflow-hidden bg-bg-base px-3.5 pt-3">
        {isLoading ? (
          // Content arrives with the workspace read. The bars are the loading
          // state — which is all they ever were, they just used to be permanent.
          <div className="flex flex-col gap-1.5 pt-0.5">
            <div className="h-[5px] w-[78%] rounded-[3px] bg-[var(--color-bar)]" />
            <div className="h-[5px] w-[55%] rounded-[3px] bg-[var(--color-bar)]" />
            <div className="h-[5px] w-[66%] rounded-[3px] bg-[var(--color-bar)]" />
          </div>
        ) : preview ? (
          <p
            dir="auto"
            className="text-[10.5px] leading-[1.55] text-text-muted [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden"
          >
            {preview}
          </p>
        ) : (
          <p className="text-[10.5px] italic leading-[1.55] text-text-muted/60">Empty note</p>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-bg-base to-transparent" />
      </div>
      <div className="flex items-center gap-2 border-t border-border px-3.5 py-[11px]">
        <svg
          className="w-4 h-4 shrink-0 text-text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
        </svg>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-text-primary group-hover:text-accent">
            {note.name}
          </span>
          <span className="block text-[11.5px] text-text-muted">{date || "Note"}</span>
        </span>
      </div>
    </button>
  );
};

const SectionLabel = ({ icon, children }) => (
  <div className="flex items-center gap-2 text-[13px] font-semibold text-text-secondary">
    {icon}
    {children}
  </div>
);

const WorkspaceDashboard = () => {
  const { items, rootFolderPath, createFolder, selectNote, getRecentNotes, scheduledNotes } =
    useNotesStore();
  const { addNotification, setShowWorkspaceModal, requestTemplateModal, requestScheduleModal } =
    useUIStore();

  const hasWorkspace = Boolean(rootFolderPath);
  const notes = useMemo(() => items.filter((item) => item.type === "note"), [items]);
  const recentNotes = useMemo(() => getRecentNotes().slice(0, 4), [getRecentNotes, items]);
  const wordCount = useMemo(
    () => notes.reduce((total, note) => total + countWords(note.content || ""), 0),
    [notes]
  );
  const folderNameById = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      if (item.type === "folder") map.set(item.id, item.name);
    });
    return map;
  }, [items]);
  const displayWorkspacePath = useMemo(
    () => (rootFolderPath ? rootFolderPath.replace(/^\/(Users|home)\/[^/]+/, "~") : ""),
    [rootFolderPath]
  );
  const upcomingSchedules = useMemo(() => (scheduledNotes || []).slice(0, 4), [scheduledNotes]);

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
      <div className="relative h-full overflow-hidden bg-bg-editor">
        <main className="relative z-10 flex h-full items-center justify-center px-6">
          <section className="w-full max-w-xl rounded-3xl border border-border bg-bg-base/75 p-7 text-center shadow-2xl shadow-black/10 backdrop-blur md:p-9">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
              <FolderIcon className="h-7 w-7" />
            </div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-accent">
              No Workspace Selected
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-text-primary md:text-4xl">
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
    <div className="relative h-full overflow-y-auto bg-bg-editor custom-scrollbar">
      <main className="relative z-10 mx-auto max-w-[840px] px-14 pb-[72px] pt-[88px]">
        <div className="mb-[38px] text-center">
          <h1 className="text-[40px] font-semibold leading-[1.1] tracking-[-0.015em] text-text-primary">
            {greeting()}
          </h1>
          <p className="mt-[9px] text-[14.5px] text-text-muted">{todayLabel()}</p>
        </div>

        <div className="mb-14 flex flex-wrap items-center justify-center gap-2">
          <QuickStart
            icon={NewPageIcon}
            label="New page"
            onClick={() => requestTemplateModal(null)}
            primary
          />
          <QuickStart
            icon={TemplatesIcon}
            label="Templates"
            onClick={() => requestTemplateModal(null)}
          />
          <QuickStart icon={NewFolderIcon} label="New folder" onClick={handleCreateFolder} />
        </div>

        {recentNotes.length > 0 && (
          <section className="mb-12">
            <div className="mb-4">
              <SectionLabel
                icon={
                  <svg
                    className="w-[15px] h-[15px]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    viewBox="0 0 24 24"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                }
              >
                Jump back in
              </SectionLabel>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {recentNotes.map((note) => (
                <RecentCard
                  key={note.id}
                  note={note}
                  date={formatDate(note.lastOpenedAt || note.updatedAt)}
                  onClick={() => selectNote(note.id)}
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-[14px] flex items-center justify-between">
            <SectionLabel
              icon={
                <svg
                  className="w-[15px] h-[15px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  viewBox="0 0 24 24"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M3 9h18M8 3v4M16 3v4" />
                </svg>
              }
            >
              Upcoming &amp; recurring
            </SectionLabel>
            <button
              onClick={() => requestScheduleModal(null)}
              className="flex items-center gap-[5px] rounded-[7px] px-[10px] py-[5px] text-[12.5px] font-medium text-accent transition-colors hover:bg-overlay-subtle"
            >
              + New schedule
            </button>
          </div>
          {upcomingSchedules.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border bg-bg-editor">
              {upcomingSchedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="flex items-center gap-3 border-b border-border px-4 py-[13px] transition-colors last:border-b-0 hover:bg-overlay-subtle"
                >
                  <span className="shrink-0 text-accent">
                    <RepeatIcon />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-text-primary">
                    {schedule.noteName || schedule.templateName}
                  </span>
                  <span className="shrink-0 text-[12.5px] text-text-muted">
                    {scheduleCadence(schedule)}
                  </span>
                  {schedule.folderId && folderNameById.get(schedule.folderId) && (
                    <span className="shrink-0 rounded-[5px] bg-overlay-subtle px-2 py-0.5 text-[11.5px] text-text-secondary">
                      {folderNameById.get(schedule.folderId)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <button
              onClick={() => requestScheduleModal(null)}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-bg-editor px-6 py-9 text-center text-text-muted transition-colors hover:border-text-muted"
            >
              <RepeatIcon />
              <span className="text-[13px] leading-relaxed">
                No recurring notes yet. Set up a daily, weekly, or monthly note.
              </span>
            </button>
          )}
        </section>

        <div className="mt-11 flex justify-center gap-[22px] border-t border-border pt-[22px] font-mono text-[12.5px] text-text-muted">
          {displayWorkspacePath && <span>{displayWorkspacePath}</span>}
          <span>{notes.length} notes</span>
          <span>{wordCount.toLocaleString()} words</span>
        </div>
      </main>
    </div>
  );
};

export default WorkspaceDashboard;
