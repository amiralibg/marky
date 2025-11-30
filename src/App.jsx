import { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import MarkdownEditor from './components/MarkdownEditor';
import OnboardingModal from './components/OnboardingModal';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import useNotesStore from './store/notesStore';

function App() {
  const items = useNotesStore((state) => state.items);
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

  return (
    <div className="h-screen flex flex-col bg-editor-bg text-white">
      <div className="flex-1 flex overflow-hidden">
        {showSidebar && <Sidebar ref={sidebarRef} onSettingsClick={() => setView('settings')} />}
        <div className="flex-1 flex flex-col">
          {view === 'editor' ? (
            <MarkdownEditor ref={editorRef} />
          ) : (
            <div className="flex-1 p-8">
              <h1 className="text-2xl font-bold mb-4">Settings</h1>
              <button
                onClick={() => setView('editor')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
              >
                Back to Editor
              </button>
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