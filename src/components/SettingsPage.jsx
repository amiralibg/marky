import { useState } from 'react';
import AppearanceSettings from './AppearanceSettings';
import EditorSettings from './EditorSettings';
import KeymapsSettings from './KeymapsSettings';
import ScheduledNotesManager from './ScheduledNotesManager';
import TagManager from './TagManager';
import useNotesStore from '../store/notesStore';
import useSettingsStore from '../store/settingsStore';
import useUIStore from '../store/uiStore';
import { exportWorkspaceAsZip, restoreWorkspaceFromZip } from '../utils/backup';

const SettingsPage = ({ onOpenKeymapsModal }) => {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);

  const handleBackup = async () => {
    const { rootFolderPath, items } = useNotesStore.getState();
    const settings = useSettingsStore.getState();
    const { addNotification } = useUIStore.getState();

    if (!rootFolderPath) {
      addNotification('No workspace folder is open', 'warning');
      return;
    }

    setIsBackingUp(true);
    try {
      const path = await exportWorkspaceAsZip(rootFolderPath, items, {
        themeId: settings.themeId,
        accentColorId: settings.accentColorId,
        vimMode: settings.vimMode,
      });
      if (path) {
        addNotification('Workspace backup saved', 'success');
      }
    } catch (err) {
      console.error('Backup failed:', err);
      addNotification('Backup failed: ' + err.message, 'error');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreBackup = async () => {
    const { addNotification } = useUIStore.getState();

    const overwriteExisting = window.confirm(
      'Overwrite files if they already exist in the destination folder?\n\nChoose Cancel to skip existing files (safer default).'
    );

    setIsRestoringBackup(true);
    try {
      const result = await restoreWorkspaceFromZip({ overwriteExisting });
      if (!result) return;

      const {
        targetFolderPath,
        writtenCount,
        skippedExistingCount,
        skippedUnsafeCount,
        manifest,
      } = result;

      const parts = [`Restored ${writtenCount} file${writtenCount !== 1 ? 's' : ''}`];
      if (skippedExistingCount > 0) {
        parts.push(`skipped ${skippedExistingCount} existing`);
      }
      if (skippedUnsafeCount > 0) {
        parts.push(`ignored ${skippedUnsafeCount} unsafe path${skippedUnsafeCount !== 1 ? 's' : ''}`);
      }

      addNotification(parts.join(' • '), 'success', 5000);

      // If restored into the currently open workspace, refresh the tree.
      const state = useNotesStore.getState();
      const currentRoot = state.rootFolderPath;
      const normalize = (p) => (p ? p.replace(/\\/g, '/').replace(/\/+$/, '') : '');
      if (normalize(currentRoot) && normalize(currentRoot) === normalize(targetFolderPath)) {
        await state.refreshRootFromDisk({ preserveSelection: true });
        addNotification('Current workspace refreshed after restore', 'info', 3000);
      } else if (manifest?.noteCount) {
        addNotification(
          `Backup manifest: ${manifest.noteCount} note${manifest.noteCount !== 1 ? 's' : ''}`,
          'info',
          3500
        );
      }
    } catch (err) {
      console.error('Restore failed:', err);
      addNotification('Restore failed: ' + err.message, 'error', 5000);
    } finally {
      setIsRestoringBackup(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg-base animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between px-8 py-6 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
          <p className="text-sm text-text-muted">Customize appearance, keyboard shortcuts, and automations.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-10 custom-scrollbar">
        {/* Appearance Section */}
        <section className="space-y-4">
          <header>
            <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
              Appearance
            </h2>
            <p className="text-sm text-text-muted mt-1">Personalize the look of your workspace.</p>
          </header>
          <div className="bg-white/5 rounded-xl border border-white/10 p-6">
            <AppearanceSettings />
          </div>
        </section>

        {/* Editor Section */}
        <section className="space-y-4">
          <header>
            <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Editor
            </h2>
            <p className="text-sm text-text-muted mt-1">Configure editor behavior and keybindings.</p>
          </header>
          <div className="bg-white/5 rounded-xl border border-white/10 p-6">
            <EditorSettings />
          </div>
        </section>

        {/* Keyboard Shortcuts Section */}
        <section className="space-y-4">
          <header>
            <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Keyboard Shortcuts
            </h2>
            <p className="text-sm text-text-muted mt-1">Configure keyboard shortcuts for quick actions.</p>
          </header>
          <div className="bg-white/5 rounded-xl border border-white/10 p-6">
            <KeymapsSettings onOpenKeymapsModal={onOpenKeymapsModal} />
          </div>
        </section>

        {/* Scheduled Notes Section */}
        <section className="space-y-4">
          <header>
            <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Scheduled Notes
            </h2>
            <p className="text-sm text-text-muted mt-1">View and manage recurring note creation.</p>
          </header>
          <div className="bg-white/5 rounded-xl border border-white/10 p-6">
            <ScheduledNotesManager />
          </div>
        </section>

        {/* Tag Manager Section */}
        <section className="space-y-4">
          <header>
            <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              Tag Manager
            </h2>
            <p className="text-sm text-text-muted mt-1">Rename, merge, or delete hashtags across your workspace.</p>
          </header>
          <div className="bg-white/5 rounded-xl border border-white/10 p-6">
            <TagManager />
          </div>
        </section>

        {/* Backup Section */}
        <section className="space-y-4">
          <header>
            <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              Backup
            </h2>
            <p className="text-sm text-text-muted mt-1">Export your workspace as a zip archive.</p>
          </header>
          <div className="bg-white/5 rounded-xl border border-white/10 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-text-secondary">Export all notes and folder structure as a .zip file.</p>
                <p className="text-xs text-text-muted mt-1">Includes settings and workspace metadata. You can also restore a backup into any folder.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleRestoreBackup}
                  disabled={isRestoringBackup || isBackingUp}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 border ${
                    isRestoringBackup || isBackingUp
                      ? 'bg-overlay-light text-text-muted cursor-not-allowed border-overlay-subtle'
                      : 'bg-overlay-subtle hover:bg-overlay-light text-text-primary border-overlay-subtle'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m12-4l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {isRestoringBackup ? 'Restoring...' : 'Restore Backup'}
                </button>

                <button
                  onClick={handleBackup}
                  disabled={isBackingUp || isRestoringBackup}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
                    isBackingUp || isRestoringBackup
                      ? 'bg-overlay-light text-text-muted cursor-not-allowed'
                      : 'bg-accent hover:bg-accent/80 text-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {isBackingUp ? 'Exporting...' : 'Export Backup'}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default SettingsPage;
