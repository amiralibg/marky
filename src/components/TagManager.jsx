import { useEffect, useMemo, useState } from 'react';
import useNotesStore from '../store/notesStore';
import useUIStore from '../store/uiStore';

const normalizeTag = (value) =>
  (value || '')
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');

const TagManager = () => {
  const tags = useNotesStore((state) => state.getAllTags());
  const applyTagOperation = useNotesStore((state) => state.applyTagOperation);
  const addNotification = useUIStore((state) => state.addNotification);

  const [selectedTag, setSelectedTag] = useState('');
  const [targetTag, setTargetTag] = useState('');
  const [filter, setFilter] = useState('');
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    if (!selectedTag && tags.length > 0) {
      setSelectedTag(tags[0].tag);
    }
  }, [tags, selectedTag]);

  const filteredTags = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((entry) => entry.tag.includes(q));
  }, [tags, filter]);

  const suggestedTargets = useMemo(() => {
    const source = normalizeTag(selectedTag);
    if (!source) return [];
    return tags
      .map((entry) => entry.tag)
      .filter((tag) => tag !== source)
      .slice(0, 12);
  }, [tags, selectedTag]);

  const selectedTagCount = tags.find((entry) => entry.tag === normalizeTag(selectedTag))?.count ?? 0;

  const runAction = async (action) => {
    const source = normalizeTag(selectedTag);
    const target = normalizeTag(targetTag);

    if (!source) {
      addNotification('Select a source tag first', 'warning');
      return;
    }

    if ((action === 'rename' || action === 'merge') && !target) {
      addNotification('Enter a target tag', 'warning');
      return;
    }

    const label = action === 'delete'
      ? `Delete tag #${source} from all notes?`
      : action === 'merge'
        ? `Merge #${source} into #${target}?`
        : `Rename #${source} to #${target}?`;

    if (!window.confirm(label)) {
      return;
    }

    setIsWorking(true);
    try {
      const result = await applyTagOperation({
        action,
        sourceTag: source,
        targetTag: target,
      });

      if (!result || result.changedNotes === 0) {
        addNotification('No notes needed changes for that tag operation', 'info');
        return;
      }

      const targetLabel = result.targetTag ? ` -> #${result.targetTag}` : '';
      const message = `${action} #${result.sourceTag}${targetLabel}: ${result.changedNotes} note${result.changedNotes !== 1 ? 's' : ''} updated${result.failedNotes ? `, ${result.failedNotes} failed` : ''}`;
      addNotification(message, result.failedNotes ? 'warning' : 'success', 5000);

      if (action !== 'delete' && result.targetTag) {
        setSelectedTag(result.targetTag);
      }
      setTargetTag('');
    } catch (error) {
      console.error('Tag operation failed:', error);
      addNotification(`Tag operation failed: ${error.message}`, 'error', 5000);
    } finally {
      setIsWorking(false);
    }
  };

  if (tags.length === 0) {
    return (
      <div className="border border-border rounded-xl bg-sidebar-bg/40 px-6 py-8 text-center text-text-muted">
        <p className="text-lg font-semibold text-text-primary mb-2">No tags yet</p>
        <p className="text-sm">Add hashtags like <code className="text-accent">#todo</code> in notes to manage them here.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(220px,300px)_1fr] gap-4">
      <div className="border border-overlay-subtle rounded-xl bg-sidebar-bg/40 p-3">
        <div className="mb-3">
          <label className="block text-xs font-medium text-text-muted mb-1">Filter tags</label>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search tags..."
            className="w-full px-3 py-2 bg-overlay-subtle border border-overlay-subtle rounded-lg text-sm text-text-primary outline-none focus:border-accent/40"
          />
        </div>

        <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-1 pr-1">
          {filteredTags.map((entry) => {
            const active = entry.tag === normalizeTag(selectedTag);
            return (
              <button
                key={entry.tag}
                type="button"
                onClick={() => setSelectedTag(entry.tag)}
                className={`w-full px-2 py-2 rounded-lg text-left border transition-colors flex items-center justify-between gap-2 ${
                  active
                    ? 'border-accent/30 bg-accent/10 text-accent'
                    : 'border-overlay-subtle bg-overlay-subtle/40 text-text-secondary hover:text-text-primary hover:border-overlay-light'
                }`}
              >
                <span className="truncate text-sm">#{entry.tag}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-overlay-subtle border border-overlay-subtle text-text-muted">
                  {entry.count}
                </span>
              </button>
            );
          })}
          {filteredTags.length === 0 && (
            <p className="text-xs text-text-muted px-2 py-4 text-center">No matching tags</p>
          )}
        </div>
      </div>

      <div className="border border-overlay-subtle rounded-xl bg-sidebar-bg/40 p-4 space-y-4">
        <div>
          <p className="text-sm text-text-muted">Selected tag</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-lg font-semibold text-text-primary">#{normalizeTag(selectedTag) || '—'}</span>
            {selectedTagCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                {selectedTagCount} note{selectedTagCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Target tag (for rename/merge)</label>
          <div className="flex items-center gap-2">
            <span className="text-text-muted text-sm">#</span>
            <input
              type="text"
              value={targetTag}
              onChange={(e) => setTargetTag(e.target.value)}
              placeholder="new-tag-name"
              className="flex-1 px-3 py-2 bg-overlay-subtle border border-overlay-subtle rounded-lg text-sm text-text-primary outline-none focus:border-accent/40"
            />
          </div>

          {suggestedTargets.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestedTargets.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTargetTag(tag)}
                  className="px-2 py-1 text-[11px] rounded-full border border-overlay-subtle bg-overlay-subtle text-text-muted hover:text-text-primary hover:border-overlay-light"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runAction('rename')}
            disabled={isWorking}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              isWorking
                ? 'border-overlay-subtle bg-overlay-light text-text-muted cursor-not-allowed'
                : 'border-accent/30 bg-accent/10 text-accent hover:bg-accent/15'
            }`}
          >
            Rename Tag
          </button>
          <button
            type="button"
            onClick={() => runAction('merge')}
            disabled={isWorking}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              isWorking
                ? 'border-overlay-subtle bg-overlay-light text-text-muted cursor-not-allowed'
                : 'border-overlay-subtle bg-overlay-subtle text-text-primary hover:bg-overlay-light'
            }`}
          >
            Merge Into Target
          </button>
          <button
            type="button"
            onClick={() => runAction('delete')}
            disabled={isWorking}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              isWorking
                ? 'border-red-500/20 bg-overlay-light text-text-muted cursor-not-allowed'
                : 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/15'
            }`}
          >
            Delete Tag From Notes
          </button>
        </div>

        <p className="text-xs text-text-muted leading-relaxed">
          Rename changes <code className="text-text-secondary">#old</code> to a new tag.
          Merge moves all occurrences into an existing tag.
          Delete removes the tag token from notes. Changes are written to disk immediately.
        </p>
      </div>
    </div>
  );
};

export default TagManager;
