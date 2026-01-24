import { useEffect, useMemo, useState } from 'react';
import useNotesStore from '../store/notesStore';

const ROOT_FOLDER_VALUE = '__workspace_root__';
const DEFAULT_TIME = '09:00';

const formatDateForInput = (date) => {
  try {
    const iso = date.toISOString();
    return iso.split('T')[0];
  } catch (error) {
    return '';
  }
};

const parseTimeString = (value) => {
  if (!value) {
    return { hours: 9, minutes: 0 };
  }

  const [hoursRaw, minutesRaw] = value.split(':');
  const hours = Number.parseInt(hoursRaw, 10);
  const minutes = Number.parseInt(minutesRaw, 10);

  return {
    hours: Number.isFinite(hours) ? hours : 9,
    minutes: Number.isFinite(minutes) ? minutes : 0
  };
};

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const clampDayOfMonth = (year, month, day) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Math.min(Math.max(day, 1), daysInMonth);
};

const withTimeOfDay = (date, timeOfDay) => {
  const { hours, minutes } = parseTimeString(timeOfDay);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
};

const getNextWeeklyOccurrence = (fromDate, daysOfWeek, timeOfDay) => {
  const normalizedDays = Array.from(
    new Set(
      (Array.isArray(daysOfWeek) ? daysOfWeek : [fromDate.getDay()]).map((day) => {
        const normalized = Number.parseInt(day, 10);
        if (!Number.isFinite(normalized)) return 0;
        return ((normalized % 7) + 7) % 7;
      })
    )
  ).sort((a, b) => a - b);

  for (let offset = 0; offset < 14; offset += 1) {
    const candidateDate = addDays(fromDate, offset);
    if (normalizedDays.includes(candidateDate.getDay())) {
      const candidate = withTimeOfDay(candidateDate, timeOfDay);
      if (candidate > fromDate) {
        return candidate;
      }
    }
  }

  return withTimeOfDay(addDays(fromDate, 7), timeOfDay);
};

const getNextMonthlyOccurrence = (fromDate, dayOfMonth, timeOfDay) => {
  const base = new Date(fromDate);
  const year = base.getFullYear();
  const month = base.getMonth();
  const targetDay = clampDayOfMonth(year, month, dayOfMonth || base.getDate());
  let candidate = withTimeOfDay(new Date(year, month, targetDay), timeOfDay);

  if (candidate <= fromDate) {
    const nextMonth = new Date(year, month + 1, 1);
    const clampedDay = clampDayOfMonth(nextMonth.getFullYear(), nextMonth.getMonth(), dayOfMonth || base.getDate());
    candidate = withTimeOfDay(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), clampedDay), timeOfDay);
  }

  return candidate;
};

const calculateNextRunPreview = (schedule, referenceDate = new Date()) => {
  if (!schedule?.frequency) return null;

  const { frequency, timeOfDay = DEFAULT_TIME, startDate } = schedule;
  const now = new Date(referenceDate);
  const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const baseline = start && !Number.isNaN(start.getTime()) && start > now ? start : now;

  let candidate;

  switch (frequency) {
    case 'daily': {
      candidate = withTimeOfDay(baseline, timeOfDay);
      if (candidate <= now) {
        candidate = withTimeOfDay(addDays(baseline, 1), timeOfDay);
      }
      break;
    }
    case 'weekly': {
      const days = Array.isArray(schedule.daysOfWeek) && schedule.daysOfWeek.length > 0
        ? schedule.daysOfWeek
        : [baseline.getDay()];
      candidate = getNextWeeklyOccurrence(baseline, days, timeOfDay);
      if (candidate <= now) {
        candidate = getNextWeeklyOccurrence(addDays(now, 1), days, timeOfDay);
      }
      break;
    }
    case 'monthly': {
      const dayOfMonth = schedule.dayOfMonth || baseline.getDate();
      candidate = getNextMonthlyOccurrence(baseline, dayOfMonth, timeOfDay);
      if (candidate <= now) {
        candidate = getNextMonthlyOccurrence(addDays(now, 1), dayOfMonth, timeOfDay);
      }
      break;
    }
    default:
      return null;
  }

  if (!candidate || Number.isNaN(candidate.getTime())) {
    return null;
  }

  if (start && candidate < withTimeOfDay(start, timeOfDay)) {
    return calculateNextRunPreview(schedule, withTimeOfDay(start, timeOfDay));
  }

  if (candidate <= now) {
    return calculateNextRunPreview(schedule, addDays(now, 1));
  }

  return candidate;
};

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' }
];

const ScheduleNoteModal = ({ isOpen, template, defaultFolderId, onClose }) => {
  const addScheduledNote = useNotesStore((state) => state.addScheduledNote);
  const createNote = useNotesStore((state) => state.createNote);
  const items = useNotesStore((state) => state.items);
  const rootFolderId = useNotesStore((state) => state.rootFolderId);

  const [selectedFolderId, setSelectedFolderId] = useState(ROOT_FOLDER_VALUE);
  const [frequency, setFrequency] = useState('daily');
  const [startDate, setStartDate] = useState(formatDateForInput(new Date()));
  const [timeOfDay, setTimeOfDay] = useState(DEFAULT_TIME);
  const [daysOfWeek, setDaysOfWeek] = useState([new Date().getDay()]);
  const [dayOfMonth, setDayOfMonth] = useState(new Date().getDate());
  const [noteName, setNoteName] = useState('');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [createImmediately, setCreateImmediately] = useState(true);

  const folderMap = useMemo(() => {
    const map = new Map();
    items
      .filter((item) => item.type === 'folder')
      .forEach((folder) => {
        map.set(folder.id, folder);
      });
    return map;
  }, [items]);

  const folderOptions = useMemo(() => {
    const buildLabel = (folder) => {
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

    const options = [
      {
        value: ROOT_FOLDER_VALUE,
        label: 'Workspace root'
      }
    ];

    folderMap.forEach((folder) => {
      if (folder.parentId === null) {
        return;
      }
      options.push({
        value: folder.id,
        label: buildLabel(folder)
      });
    });

    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [folderMap]);

  useEffect(() => {
    if (!isOpen) return;

    const now = new Date();
    setFrequency('daily');
    setStartDate(formatDateForInput(now));
    setTimeOfDay(DEFAULT_TIME);
    setDaysOfWeek([now.getDay()]);
    setDayOfMonth(now.getDate());
    setError(null);
    setIsSaving(false);
    setCreateImmediately(true);

    if (template) {
      setNoteName(template.suggestedTitle || template.name || '');
    } else {
      setNoteName('');
    }

    const resolveFolderSelection = () => {
      if (defaultFolderId) {
        const folder = folderMap.get(defaultFolderId);
        if (!folder || folder.parentId === null) {
          return ROOT_FOLDER_VALUE;
        }
        return defaultFolderId;
      }

      if (rootFolderId) {
        const rootFolder = folderMap.get(rootFolderId);
        if (!rootFolder || rootFolder.parentId === null) {
          return ROOT_FOLDER_VALUE;
        }
        return rootFolderId;
      }

      return ROOT_FOLDER_VALUE;
    };

    setSelectedFolderId(resolveFolderSelection());
  }, [isOpen, template, defaultFolderId, rootFolderId, folderMap]);

  const handleToggleDay = (day) => {
    setDaysOfWeek((prev) => {
      const exists = prev.includes(day);
      if (exists) {
        return prev.filter((value) => value !== day);
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!template) return;

    setError(null);

    if (frequency === 'weekly' && daysOfWeek.length === 0) {
      setError('Select at least one day of the week.');
      return;
    }

    if (frequency === 'monthly') {
      const numericDay = Number.parseInt(dayOfMonth, 10);
      if (!Number.isFinite(numericDay) || numericDay < 1 || numericDay > 31) {
        setError('Day of the month must be between 1 and 31.');
        return;
      }
    }

    setIsSaving(true);

    try {
      const resolvedFolderId = selectedFolderId === ROOT_FOLDER_VALUE ? null : selectedFolderId;
      const resolvedName = noteName.trim() || template.suggestedTitle || template.name;

      if (createImmediately) {
        await createNote(resolvedFolderId, template.content, resolvedName);
      }

      await addScheduledNote({
        templateId: template.id,
        templateType: template.type,
        templateName: template.name,
        templateIcon: template.icon,
        noteName: noteName.trim(),
        folderId: resolvedFolderId,
        frequency,
        timeOfDay,
        daysOfWeek: frequency === 'weekly' ? daysOfWeek : [],
        dayOfMonth: frequency === 'monthly' ? Number.parseInt(dayOfMonth, 10) : null,
        startDate: startDate || null
      });

      onClose();
    } catch (submitError) {
      console.error('Failed to schedule note:', submitError);
      setError(submitError?.message || 'Failed to schedule note.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !template) {
    return null;
  }

  const schedulePreview = calculateNextRunPreview(
    {
      frequency,
      timeOfDay,
      daysOfWeek: frequency === 'weekly' ? daysOfWeek : [],
      dayOfMonth: frequency === 'monthly' ? Number.parseInt(dayOfMonth, 10) : null,
      startDate: startDate || null
    },
    new Date()
  );

  const previewLabel = schedulePreview
    ? schedulePreview.toLocaleString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
    : 'Will calculate when saved';

  const activeFolderOption = folderOptions.find((option) => option.value === selectedFolderId);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fadeIn"
        onClick={onClose}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <form
          className="glass-panel border-glass-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col pointer-events-auto animate-slideUp"
          onSubmit={handleSubmit}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="border-b border-glass-border px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl" aria-hidden="true">{template.icon}</span>
              <div>
                <h2 className="text-xl font-semibold text-text-primary">Schedule recurring note</h2>
                <p className="text-sm text-text-muted">Automatically create <span className="text-text-primary font-medium">{template.name}</span> on a schedule.</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-primary">Save to folder</span>
                <select
                  value={selectedFolderId}
                  onChange={(event) => setSelectedFolderId(event.target.value)}
                  className="w-full px-3 py-2 bg-overlay-subtle border border-overlay-light rounded-lg text-text-primary focus:outline-none focus:border-accent"
                >
                  {folderOptions.map((option) => (
                    <option key={option.value} value={option.value} className="bg-bg-sidebar">
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-primary">Note name (optional)</span>
                <input
                  type="text"
                  value={noteName}
                  onChange={(event) => setNoteName(event.target.value)}
                  placeholder={template.suggestedTitle || template.name}
                  className="w-full px-3 py-2 bg-overlay-subtle border border-overlay-light rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                />
                <span className="text-xs text-text-muted">Leave blank to use the template’s suggested title each time.</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-primary">Frequency</span>
                <select
                  value={frequency}
                  onChange={(event) => setFrequency(event.target.value)}
                  className="w-full px-3 py-2 bg-overlay-subtle border border-overlay-light rounded-lg text-text-primary focus:outline-none focus:border-accent"
                >
                  <option value="daily" className="bg-bg-sidebar">Daily</option>
                  <option value="weekly" className="bg-bg-sidebar">Weekly</option>
                  <option value="monthly" className="bg-bg-sidebar">Monthly</option>
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-primary">Start date</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="w-full px-3 py-2 bg-overlay-subtle border border-overlay-light rounded-lg text-text-primary focus:outline-none focus:border-accent color-scheme-dark"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-primary">Time of day</span>
                <input
                  type="time"
                  value={timeOfDay}
                  onChange={(event) => setTimeOfDay(event.target.value)}
                  className="w-full px-3 py-2 bg-overlay-subtle border border-overlay-light rounded-lg text-text-primary focus:outline-none focus:border-accent color-scheme-dark"
                />
              </label>
            </div>

            {frequency === 'weekly' && (
              <div>
                <p className="text-sm font-medium text-text-primary mb-2">Repeat on</p>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map((day) => {
                    const isSelected = daysOfWeek.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => handleToggleDay(day.value)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${isSelected
                            ? 'bg-accent text-text-primary'
                            : 'bg-overlay-subtle text-text-secondary hover:bg-overlay-light hover:text-text-primary'
                          }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-text-muted mt-2">Select one or more days of the week.</p>
              </div>
            )}

            {frequency === 'monthly' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-text-primary">Day of month</span>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={dayOfMonth}
                    onChange={(event) => setDayOfMonth(event.target.value)}
                    className="w-full px-3 py-2 bg-overlay-subtle border border-overlay-light rounded-lg text-text-primary focus:outline-none focus:border-accent"
                  />
                  <span className="text-xs text-text-muted">Notes will be created on this day each month.</span>
                </label>
              </div>
            )}

            <div className="bg-overlay-subtle border border-overlay-light rounded-lg px-4 py-3">
              <p className="text-sm text-text-primary font-medium">Next run preview</p>
              <p className="text-sm text-text-muted">
                {previewLabel}
              </p>
              {activeFolderOption && (
                <p className="text-xs text-text-muted mt-2">
                  Notes will be saved to <span className="text-text-primary">{activeFolderOption.label}</span>.
                </p>
              )}
              <label className="mt-3 flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={createImmediately}
                  onChange={(event) => setCreateImmediately(event.target.checked)}
                  className="h-4 w-4 rounded border-overlay-medium bg-overlay-light"
                />
                <span>Create the first note right away</span>
              </label>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/40 text-red-200 px-4 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}
          </div>

          <div className="border-t border-overlay-light px-6 py-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-overlay-light rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${isSaving
                  ? 'bg-overlay-light text-text-muted cursor-not-allowed'
                  : 'bg-accent text-text-primary hover:bg-accent/90'
                }`}
            >
              {isSaving ? 'Saving…' : 'Save schedule'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </>
  );
};

export default ScheduleNoteModal;
