import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import MarkdownEditor from './components/MarkdownEditor';
import OnboardingModal from './components/OnboardingModal';
import ScheduledNotesManager from './components/ScheduledNotesManager';
import TemplateModal from './components/TemplateModal';
import ScheduleNoteModal from './components/ScheduleNoteModal';
import GraphModal from './components/GraphModal';
import NotificationToast from './components/NotificationToast';
import TitleBar from './components/TitleBar';
import KeymapsModal from './components/KeymapsModal';
import AppearanceSettings from './components/AppearanceSettings';
import KeymapsSettings from './components/KeymapsSettings';
import useNotesStore from './store/notesStore';
import useSettingsStore, { matchesKeymap } from './store/settingsStore';

function App() {
  const items = useNotesStore((state) => state.items);
  const { sidebarWidth, setSidebarWidth, createNote, renameItem } = useNotesStore();
  const { keymaps, initializeSettings, isRecordingKeymap } = useSettingsStore();
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  // Initialize settings (apply accent color) on mount
  useEffect(() => {
    initializeSettings();
  }, [initializeSettings]);

  const startResizingSidebar = useCallback((e) => {
    e.preventDefault();
    setIsResizingSidebar(true);
  }, []);

  const stopResizingSidebar = useCallback(() => {
    setIsResizingSidebar(false);
  }, []);

  const resizeSidebar = useCallback((e) => {
    if (isResizingSidebar) {
      const newWidth = e.clientX;
      if (newWidth >= 160 && newWidth <= 600) {
        setSidebarWidth(newWidth);
      }
    }
  }, [isResizingSidebar, setSidebarWidth]);

  useEffect(() => {
    if (isResizingSidebar) {
      window.addEventListener('mousemove', resizeSidebar);
      window.addEventListener('mouseup', stopResizingSidebar);
    } else {
      window.removeEventListener('mousemove', resizeSidebar);
      window.removeEventListener('mouseup', stopResizingSidebar);
    }
    return () => {
      window.removeEventListener('mousemove', resizeSidebar);
      window.removeEventListener('mouseup', stopResizingSidebar);
    };
  }, [isResizingSidebar, resizeSidebar, stopResizingSidebar]);

  const processDueSchedules = useNotesStore((state) => state.processDueSchedules);
  const [view, setView] = useState('editor');
  const [showKeymapsModal, setShowKeymapsModal] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  // Modal states
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showGraphModal, setShowGraphModal] = useState(false);
  const [scheduleTemplate, setScheduleTemplate] = useState(null);
  const [templateParentId, setTemplateParentId] = useState(null);
  const [renamingItem, setRenamingItem] = useState(null);

  const sidebarRef = useRef(null);
  const editorRef = useRef(null);

  const handleTemplateSelect = useCallback(async (template) => {
    try {
      await createNote(
        templateParentId,
        template.content,
        template.suggestedTitle || template.name
      );
    } catch (error) {
      if (error?.message && /exists/i.test(error.message)) {
        return;
      }
      console.error('Failed to create note:', error);
      alert('Failed to create note: ' + error.message);
    }
  }, [createNote, templateParentId]);

  const handleScheduleTemplate = useCallback((template) => {
    setScheduleTemplate(template);
    setShowScheduleModal(true);
  }, []);

  const handleRenameSubmit = async (newName) => {
    const trimmed = newName.trim();
    if (renamingItem && trimmed) {
      try {
        await renameItem(renamingItem.id, trimmed);
      } catch (error) {
        console.error('Failed to rename item:', error);
        alert('Failed to rename: ' + error.message);
      }
    }
    setRenamingItem(null);
  };

  const showOnboarding = items.length === 0;

  // Global keyboard shortcut listener using configurable keymaps
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't handle shortcuts when recording a new keymap
      if (isRecordingKeymap) {
        return;
      }

      // Don't handle shortcuts when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // Show keymaps modal
      if (matchesKeymap(e, keymaps.showShortcuts)) {
        e.preventDefault();
        setShowKeymapsModal(true);
        return;
      }

      // Toggle sidebar
      if (matchesKeymap(e, keymaps.toggleSidebar)) {
        e.preventDefault();
        setShowSidebar(prev => !prev);
        return;
      }

      // New note
      if (matchesKeymap(e, keymaps.newNote)) {
        e.preventDefault();
        sidebarRef.current?.handleNewNote?.();
        return;
      }

      // New folder
      if (matchesKeymap(e, keymaps.newFolder)) {
        e.preventDefault();
        sidebarRef.current?.handleNewFolder?.();
        return;
      }

      // Open folder
      if (matchesKeymap(e, keymaps.openFolder)) {
        e.preventDefault();
        sidebarRef.current?.handleOpenFolder?.();
        return;
      }

      // View modes
      if (matchesKeymap(e, keymaps.viewEditor)) {
        e.preventDefault();
        editorRef.current?.setViewMode?.('editor');
        return;
      }

      if (matchesKeymap(e, keymaps.viewSplit)) {
        e.preventDefault();
        editorRef.current?.setViewMode?.('split');
        return;
      }

      if (matchesKeymap(e, keymaps.viewPreview)) {
        e.preventDefault();
        editorRef.current?.setViewMode?.('preview');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keymaps, isRecordingKeymap]);

  useEffect(() => {
    if (typeof processDueSchedules !== 'function') {
      return undefined;
    }

    let isMounted = true;

    const run = async () => {
      try {
        await processDueSchedules();
      } catch (error) {
        console.error('Scheduled note processing failed:', error);
      }
    };

    run();

    const interval = setInterval(() => {
      processDueSchedules().catch((error) => {
        if (!isMounted) return;
        console.error('Scheduled note processing failed:', error);
      });
    }, 60 * 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [processDueSchedules]);

  return (
    <div className={`h-screen flex flex-col bg-bg-base text-text-primary overflow-hidden ${isResizingSidebar ? 'select-none cursor-col-resize' : ''}`}>
      {/* Custom Title Bar */}
      <TitleBar
        sidebarWidth={sidebarWidth}
        showSidebar={showSidebar}
        onNewNote={() => sidebarRef.current?.handleNewNote?.()}
        onNewFolder={() => sidebarRef.current?.handleNewFolder?.()}
        onToggleSidebar={() => setShowSidebar(prev => !prev)}
      />

      <div className="flex-1 flex relative overflow-hidden">
        {/* Sidebar */}
        <div
          className={`
            relative shrink-0
            ${!showSidebar ? 'hidden' : ''}
            ${isResizingSidebar ? 'transition-none' : 'transition-transform duration-300 ease-in-out'}
            flex flex-col border-r border-border overflow-hidden
          `}
          style={{ width: `${sidebarWidth}px` }}
        >
          {showSidebar && (
            <Sidebar
              ref={sidebarRef}
              onSettingsClick={() => setView('settings')}
              onOpenGraph={() => setShowGraphModal(true)}
              onOpenTemplate={(parentId) => {
                setTemplateParentId(parentId);
                setShowTemplateModal(true);
              }}
              onOpenSchedule={(template) => {
                setScheduleTemplate(template);
                setShowScheduleModal(true);
              }}
              onRenameItem={(item) => setRenamingItem(item)}
            />
          )}
        </div>

        {/* Resize Handle */}
        {showSidebar && (
          <div
            onMouseDown={startResizingSidebar}
            className={`
              w-1.5 h-full cursor-col-resize hover:bg-accent/50 transition-colors z-20 shrink-0
              ${isResizingSidebar ? 'bg-accent opacity-100' : 'bg-transparent opacity-0'}
            `}
          />
        )}

        {/* Main Content */}
        <div className={`flex-1 flex flex-col min-w-0 bg-bg-editor ${isResizingSidebar ? 'pointer-events-none' : ''}`}>
          {view === 'editor' ? (
            <MarkdownEditor ref={editorRef} />
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden bg-bg-base animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between px-8 py-6 border-b border-border">
                <div>
                  <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
                  <p className="text-sm text-text-muted">Customize appearance, keyboard shortcuts, and automations.</p>
                </div>
                <button
                  onClick={() => setView('editor')}
                  className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors shadow-lg shadow-accent/20"
                >
                  Back to editor
                </button>
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
                    <KeymapsSettings onOpenKeymapsModal={() => setShowKeymapsModal(true)} />
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
              </div>
            </div>
          )}
        </div>
      </div>
      {showOnboarding && <OnboardingModal />}
      <KeymapsModal
        isOpen={showKeymapsModal}
        onClose={() => setShowKeymapsModal(false)}
      />
      <TemplateModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onSelectTemplate={handleTemplateSelect}
        onScheduleTemplate={handleScheduleTemplate}
      />
      <ScheduleNoteModal
        isOpen={showScheduleModal}
        template={scheduleTemplate}
        defaultFolderId={templateParentId}
        onClose={() => {
          setShowScheduleModal(false);
          setScheduleTemplate(null);
        }}
      />
      <GraphModal
        isOpen={showGraphModal}
        onClose={() => setShowGraphModal(false)}
      />
      <NotificationToast />
      {renamingItem && (
        <RenameDialog
          item={renamingItem}
          onSubmit={handleRenameSubmit}
          onCancel={() => setRenamingItem(null)}
        />
      )}
    </div>
  );
}

const RenameDialog = ({ item, onSubmit, onCancel }) => {
  const [newName, setNewName] = useState(item.name);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onSubmit(newName);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-titlebar-bg border border-border rounded-lg shadow-2xl p-6 w-96 animate-in zoom-in-95 duration-200">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Rename {item.type === 'folder' ? 'Folder' : 'Note'}
        </h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 bg-bg-editor border border-border rounded text-text-primary outline-none focus:border-accent transition-colors"
            placeholder="Enter new name"
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-overlay-light hover:bg-overlay-medium text-text-primary rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded transition-colors"
              disabled={!newName.trim()}
            >
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default App;
