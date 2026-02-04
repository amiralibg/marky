import { useState } from 'react';
import AppearanceSettings from './AppearanceSettings';
import EditorSettings from './EditorSettings';
import KeymapsSettings from './KeymapsSettings';
import ScheduledNotesManager from './ScheduledNotesManager';
import useNotesStore from '../store/notesStore';
import useSettingsStore from '../store/settingsStore';
import useUIStore from '../store/uiStore';
import { exportWorkspaceAsZip } from '../utils/backup';

const SettingsPage = ({ onOpenKeymapsModal }) => {
  const [isBackingUp, setIsBackingUp] = useState(false);

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
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-secondary">Export all notes and folder structure as a .zip file.</p>
                <p className="text-xs text-text-muted mt-1">Includes settings and workspace metadata.</p>
              </div>
              <button
                onClick={handleBackup}
                disabled={isBackingUp}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
                  isBackingUp
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
        </section>
      </div>
    </div>
  );
};

export default SettingsPage;
