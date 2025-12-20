import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import MarkdownEditor from './components/MarkdownEditor';
import OnboardingModal from './components/OnboardingModal';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import ScheduledNotesManager from './components/ScheduledNotesManager';
import TemplateModal from './components/TemplateModal';
import ScheduleNoteModal from './components/ScheduleNoteModal';
import GraphModal from './components/GraphModal';
import NotificationToast from './components/NotificationToast';
import Tabs from './components/Tabs';
import useNotesStore from './store/notesStore';
import useUIStore from './store/uiStore';

function App() {
  const items = useNotesStore((state) => state.items);
  const { sidebarWidth, setSidebarWidth, createNote, renameItem } = useNotesStore();
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

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
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

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

  // Handle media query for mobile
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const handleResize = (e) => {
      setIsMobile(e.matches);
      if (e.matches) {
        setShowSidebar(false);
      } else {
        setShowSidebar(true);
      }
    };

    // Initial check
    setIsMobile(mediaQuery.matches);
    if (mediaQuery.matches) {
      setShowSidebar(false);
    }

    mediaQuery.addEventListener('change', handleResize);
    return () => mediaQuery.removeEventListener('change', handleResize);
  }, []);

  // Close sidebar on mobile when changing view or performing actions
  const handleSidebarAction = () => {
    if (isMobile) {
      setShowSidebar(false);
    }
  };

  // Global keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + ? to show shortcuts
      if (isMod && e.key === '?') {
        e.preventDefault();
        setShowShortcuts(true);
      }

      // Cmd/Ctrl + / to toggle sidebar
      if (isMod && e.key === '/') {
        e.preventDefault();
        setShowSidebar(prev => !prev);
      }

      // Cmd/Ctrl + N to create new note (delegate to sidebar)
      if (isMod && !e.shiftKey && e.key === 'n') {
        e.preventDefault();
        sidebarRef.current?.handleNewNote?.();
        if (isMobile) setShowSidebar(true);
      }

      // Cmd/Ctrl + Shift + N to create new folder (delegate to sidebar)
      if (isMod && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        sidebarRef.current?.handleNewFolder?.();
        if (isMobile) setShowSidebar(true);
      }

      // Cmd/Ctrl + O to open folder (delegate to sidebar)
      if (isMod && e.key === 'o') {
        e.preventDefault();
        sidebarRef.current?.handleOpenFolder?.();
      }

      // Cmd/Ctrl + S is handled by browser/Tauri automatically

      // Cmd/Ctrl + 1/2/3 for view modes (delegate to editor)
      if (isMod && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault();
        editorRef.current?.setViewMode?.(
          e.key === '1' ? 'editor' : e.key === '2' ? 'split' : 'preview'
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobile]);

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
      <div className="flex-1 flex relative overflow-hidden">
        {/* Mobile Backdrop */}
        {isMobile && showSidebar && (
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm z-20 fade-in"
            onClick={() => setShowSidebar(false)}
          />
        )}

        {/* Sidebar */}
        <div
          className={`
            ${isMobile ? 'absolute inset-y-0 left-0 z-30 shadow-2xl glass-panel' : 'relative shrink-0'}
            ${!showSidebar && !isMobile ? 'hidden' : ''}
            ${isMobile && !showSidebar ? '-translate-x-full' : 'translate-x-0'}
            ${isResizingSidebar ? 'transition-none' : 'transition-transform duration-300 ease-in-out'}
            flex flex-col border-r border-border overflow-hidden
          `}
          style={{ width: isMobile ? '280px' : `${sidebarWidth}px` }}
        >
          {showSidebar && (
            <Sidebar
              ref={sidebarRef}
              isMobile={isMobile}
              onClose={() => setShowSidebar(false)}
              onSettingsClick={() => {
                setView('settings');
                handleSidebarAction();
              }}
              onNoteSelect={handleSidebarAction}
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
        {!isMobile && showSidebar && (
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
          {view === 'editor' && <Tabs />}

          {/* Mobile Header Toggle (only when sidebar is hidden) */}
          {isMobile && !showSidebar && (
            <button
              onClick={() => setShowSidebar(true)}
              className="absolute top-3 left-4 z-50 p-2 bg-bg-base/80 backdrop-blur border border-border rounded-lg shadow-sm text-text-secondary hover:text-text-primary"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}

          {view === 'editor' ? (
            <MarkdownEditor ref={editorRef} />
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden bg-bg-base animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between px-8 py-6 border-b border-border">
                <div>
                  <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
                  <p className="text-sm text-text-muted">Manage automations and workspace preferences.</p>
                </div>
                <button
                  onClick={() => setView('editor')}
                  className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors shadow-lg shadow-accent/20"
                >
                  Back to editor
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-8 py-6 space-y-10 custom-scrollbar">
                <section className="space-y-4">
                  <header className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-text-primary">Scheduled notes</h2>
                      <p className="text-sm text-text-muted">View and manage recurring note creation.</p>
                    </div>
                  </header>
                  <ScheduledNotesManager />
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
      {showOnboarding && <OnboardingModal />}
      <KeyboardShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
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
        <h2 className="text-lg font-semibold text-white mb-4">
          Rename {item.type === 'folder' ? 'Folder' : 'Note'}
        </h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 bg-editor-bg border border-border rounded text-white outline-none focus:border-accent transition-colors"
            placeholder="Enter new name"
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-border hover:bg-border/80 text-white rounded transition-colors"
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