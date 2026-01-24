import { useMemo } from 'react';
import useNotesStore from '../store/notesStore';

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const buildFolderLabel = (folderId, folderMap) => {
  if (!folderId) {
    return 'Workspace root';
  }

  const folder = folderMap.get(folderId);
  if (!folder) {
    return 'Workspace root';
  }

  const parts = [folder.name];
  const visited = new Set([folder.id]);
  let parentId = folder.parentId;

  while (parentId) {
    if (visited.has(parentId)) break;
    visited.add(parentId);
    const parent = folderMap.get(parentId);
    if (!parent) break;
    parts.push(parent.name);
    parentId = parent.parentId;
  }

  return parts.reverse().join(' / ');
};

const formatScheduleSummary = (schedule) => {
  if (!schedule) return '';
  const timeLabel = schedule.timeOfDay || '09:00';

  switch (schedule.frequency) {
    case 'daily':
      return `Daily at ${timeLabel}`;
    case 'weekly': {
      const labels = (schedule.daysOfWeek && schedule.daysOfWeek.length > 0
        ? schedule.daysOfWeek
        : [])
        .map((day) => DAYS_SHORT[((day % 7) + 7) % 7])
        .join(', ');
      return labels ? `Weekly on ${labels} at ${timeLabel}` : `Weekly at ${timeLabel}`;
    }
    case 'monthly': {
      const day = schedule.dayOfMonth || '1';
      return `Monthly on day ${day} at ${timeLabel}`;
    }
    default:
      return 'Custom schedule';
  }
};

const formatNextRun = (schedule) => {
  if (!schedule?.enabled) {
    return 'Disabled';
  }

  if (!schedule.nextRunAt) {
    return 'Pending calculation';
  }

  const nextRun = new Date(schedule.nextRunAt);
  if (Number.isNaN(nextRun.getTime())) {
    return 'Pending calculation';
  }

  return nextRun.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatLastRun = (schedule) => {
  if (!schedule?.lastRunAt) return null;
  const lastRun = new Date(schedule.lastRunAt);
  if (Number.isNaN(lastRun.getTime())) return null;
  return lastRun.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const ScheduledNotesManager = () => {
  const scheduledNotes = useNotesStore((state) => state.scheduledNotes);
  const setScheduledNoteEnabled = useNotesStore((state) => state.setScheduledNoteEnabled);
  const deleteScheduledNote = useNotesStore((state) => state.deleteScheduledNote);
  const items = useNotesStore((state) => state.items);

  const folderMap = useMemo(() => {
    const map = new Map();
    items
      .filter((item) => item.type === 'folder')
      .forEach((folder) => {
        map.set(folder.id, folder);
      });
    return map;
  }, [items]);

  if (!scheduledNotes || scheduledNotes.length === 0) {
    return (
      <div className="border border-border rounded-xl bg-sidebar-bg/40 px-6 py-10 text-center text-text-muted">
        <p className="text-lg font-semibold text-text-primary mb-2">No scheduled notes yet</p>
        <p className="text-sm">Create a schedule from the template picker to have Marky create notes automatically.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {scheduledNotes.map((schedule) => {
        const summary = formatScheduleSummary(schedule);
        const nextRun = formatNextRun(schedule);
        const lastRun = formatLastRun(schedule);
        const folderLabel = buildFolderLabel(schedule.folderId, folderMap);

        return (
          <div
            key={schedule.id}
            className="border border-overlay-light bg-sidebar-bg/60 rounded-xl px-5 py-4 flex flex-col gap-3"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden="true">{schedule.templateIcon || '📝'}</span>
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">{schedule.templateName || 'Template'}</h3>
                  <p className="text-sm text-text-muted">{summary}</p>
                  <p className="text-sm text-text-muted">Next run: <span className="text-text-primary/90">{nextRun}</span></p>
                  <p className="text-xs text-text-muted">
                    Destination: <span className="text-text-primary/80">{folderLabel}</span>
                    {schedule.noteName && (
                      <span> · Title override: <span className="text-text-primary/70">{schedule.noteName}</span></span>
                    )}
                  </p>
                  {lastRun && (
                    <p className="text-xs text-text-muted">Last run: <span className="text-text-primary/70">{lastRun}</span></p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-center">
                <button
                  type="button"
                  onClick={() => setScheduledNoteEnabled(schedule.id, !schedule.enabled)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors border ${
                    schedule.enabled
                      ? 'border-overlay-medium text-text-primary hover:bg-overlay-light'
                      : 'border-accent text-accent hover:bg-accent/10'
                  }`}
                >
                  {schedule.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Delete this scheduled note?')) {
                      deleteScheduledNote(schedule.id);
                    }
                  }}
                  className="px-3 py-1.5 text-sm rounded-lg transition-colors border border-red-500/40 text-red-300 hover:bg-red-500/10"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ScheduledNotesManager;
