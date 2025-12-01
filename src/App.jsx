import { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import MarkdownEditor from './components/MarkdownEditor';
import OnboardingModal from './components/OnboardingModal';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import ScheduledNotesManager from './components/ScheduledNotesManager';
import useNotesStore from './store/notesStore';

function App() {
  const items = useNotesStore((state) => state.items);
  const processDueSchedules = useNotesStore((state) => state.processDueSchedules);
  const [view, setView] = useState('editor');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const sidebarRef = useRef(null);
  const editorRef = useRef(null);

  const showOnboarding = items.length === 0;

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
      }
      
      // Cmd/Ctrl + Shift + N to create new folder (delegate to sidebar)
      if (isMod && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        sidebarRef.current?.handleNewFolder?.();
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
  }, []);

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
    <div className="h-screen flex flex-col bg-editor-bg text-white">
      <div className="flex-1 flex overflow-hidden">
        {showSidebar && <Sidebar ref={sidebarRef} onSettingsClick={() => setView('settings')} />}
        <div className="flex-1 flex flex-col">
          {view === 'editor' ? (
            <MarkdownEditor ref={editorRef} />
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-8 py-6 border-b border-white/10">
                <div>
                  <h1 className="text-2xl font-bold text-white">Settings</h1>
                  <p className="text-sm text-text-muted">Manage automations and workspace preferences.</p>
                </div>
                <button
                  onClick={() => setView('editor')}
                  className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent/90 rounded-lg transition-colors"
                >
                  Back to editor
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-8 py-6 space-y-10">
                <section className="space-y-4">
                  <header className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-white">Scheduled notes</h2>
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
    </div>
  );
}

export default App;