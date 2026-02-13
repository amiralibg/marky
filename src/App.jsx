import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import MarkdownEditor from './components/MarkdownEditor';
import OnboardingModal from './components/OnboardingModal';
import WorkspaceRequiredModal from './components/WorkspaceRequiredModal';
import TemplateModal from './components/TemplateModal';
import ScheduleNoteModal from './components/ScheduleNoteModal';
import GraphModal from './components/GraphModal';
import SearchModal from './components/SearchModal';
import CommandPalette from './components/CommandPalette';
import NotificationToast from './components/NotificationToast';
import TitleBar from './components/TitleBar';
import KeymapsModal from './components/KeymapsModal';
import ConfirmDialog from './components/ConfirmDialog';
import useNotesStore, { SETTINGS_TAB_ID } from './store/notesStore';
import useSettingsStore, { matchesKeymap } from './store/settingsStore';
import useUIStore from './store/uiStore';
import { exportWorkspaceAsZip } from './utils/backup';

function App() {
  const items = useNotesStore((state) => state.items);
  const { sidebarWidth, setSidebarWidth, createNote, renameItem, selectNote, closeNote, currentNoteId } = useNotesStore();
  const { keymaps, initializeSettings, isRecordingKeymap } = useSettingsStore();
  const { focusMode, toggleFocusMode, showWorkspaceModal, setShowWorkspaceModal } = useUIStore();
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
  const [showKeymapsModal, setShowKeymapsModal] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [closeConfirmation, setCloseConfirmation] = useState(null); // { noteId, noteName }

  // Modal states
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showGraphModal, setShowGraphModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [scheduleTemplate, setScheduleTemplate] = useState(null);
  const [templateParentId, setTemplateParentId] = useState(null);
  const [renamingItem, setRenamingItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

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
      if (/workspace/i.test(error.message)) {
        setShowWorkspaceModal(true);
      } else {
        alert('Failed to create note: ' + error.message);
      }
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

  const handleCloseTab = useCallback((noteId) => {
    // Settings tab can be closed directly without confirmation
    if (noteId === SETTINGS_TAB_ID) {
      closeNote(noteId);
      return;
    }

    // Check if the note has unsaved changes
    const hasUnsaved = useNotesStore.getState().isNoteDirty(noteId);
    if (hasUnsaved) {
      const note = items.find(item => item.id === noteId);
      setCloseConfirmation({ noteId, noteName: note?.name || 'Untitled' });
    } else {
      closeNote(noteId);
    }
  }, [closeNote, items]);

  const handleSearchResultSelect = useCallback((query) => {
    setSearchQuery(query);
    // After a short delay, scroll to and highlight the text
    setTimeout(() => {
      if (editorRef.current?.scrollToAndHighlight) {
        editorRef.current.scrollToAndHighlight(query);
      }
    }, 100);
  }, []);

  const handleCommandExecute = useCallback((command) => {
    const { action, payload } = command;

    switch (action) {
      case 'selectNote':
        // Navigate to a note
        selectNote(payload);
        break;
      case 'newNote':
        sidebarRef.current?.handleNewNote?.();
        break;
      case 'newFolder':
        sidebarRef.current?.handleNewFolder?.();
        break;
      case 'openFolder':
        sidebarRef.current?.handleOpenFolder?.();
        break;
      case 'save':
        // Trigger save in editor
        editorRef.current?.handleSave?.();
        break;
      case 'search':
        setShowSearchModal(true);
        break;
      case 'toggleSidebar':
        setShowSidebar(prev => !prev);
        break;
      case 'viewEditor':
        editorRef.current?.setViewMode?.('editor');
        break;
      case 'viewSplit':
        editorRef.current?.setViewMode?.('split');
        break;
      case 'viewPreview':
        editorRef.current?.setViewMode?.('preview');
        break;
      case 'openGraph':
        setShowGraphModal(true);
        break;
      case 'exportNote':
        editorRef.current?.handleExport?.();
        break;
      case 'openSettings':
        selectNote(SETTINGS_TAB_ID);
        break;
      case 'showShortcuts':
        setShowKeymapsModal(true);
        break;
      case 'toggleFocusMode':
        toggleFocusMode();
        break;
      case 'backupWorkspace': {
        const { rootFolderPath, items: storeItems } = useNotesStore.getState();
        const settings = useSettingsStore.getState();
        const { addNotification } = useUIStore.getState();
        if (!rootFolderPath) {
          addNotification('No workspace folder is open', 'warning');
          break;
        }
        exportWorkspaceAsZip(rootFolderPath, storeItems, {
          themeId: settings.themeId,
          accentColorId: settings.accentColorId,
          vimMode: settings.vimMode,
        }).then(path => {
          if (path) addNotification('Workspace backup saved', 'success');
        }).catch(err => {
          console.error('Backup failed:', err);
          addNotification('Backup failed: ' + err.message, 'error');
        });
        break;
      }
      default:
        console.warn(`Unknown command action: ${action}`);
    }
  }, [selectNote, setShowSidebar, toggleFocusMode]);

  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const showOnboarding = items.length === 0 && !onboardingDismissed;

  // Global keyboard shortcut listener using configurable keymaps
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't handle shortcuts when recording a new keymap
      if (isRecordingKeymap) {
        return;
      }

      // Command palette - allow even when typing
      if (matchesKeymap(e, keymaps.commandPalette)) {
        e.preventDefault();
        setShowCommandPalette(true);
        return;
      }

      // Search modal - allow even when typing
      if (matchesKeymap(e, keymaps.search)) {
        e.preventDefault();
        setShowSearchModal(true);
        return;
      }

      // Close current tab (Cmd/Ctrl+W)
      // Allow this even when typing in the editor
      if (matchesKeymap(e, keymaps.closeTab)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (currentNoteId) {
          handleCloseTab(currentNoteId);
        }
        return;
      }

      // Focus mode toggle (Cmd/Ctrl+Shift+Enter) - allow even when typing
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        toggleFocusMode();
        return;
      }

      // Escape exits focus mode
      if (e.key === 'Escape' && focusMode) {
        e.preventDefault();
        toggleFocusMode();
        return;
      }

      // Don't handle other shortcuts when typing in inputs
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
  }, [keymaps, isRecordingKeymap, currentNoteId, handleCloseTab, focusMode, toggleFocusMode]);

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
      {!focusMode && (
        <TitleBar
          sidebarWidth={sidebarWidth}
          showSidebar={showSidebar}
          onNewNote={() => sidebarRef.current?.handleNewNote?.()}
          onNewFolder={() => sidebarRef.current?.handleNewFolder?.()}
          onToggleSidebar={() => setShowSidebar(prev => !prev)}
          onCloseTab={handleCloseTab}
        />
      )}

      <div className="flex-1 flex relative overflow-hidden">
        {/* Sidebar */}
        {!focusMode && (
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
                onSettingsClick={() => selectNote(SETTINGS_TAB_ID)}
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
        )}

        {/* Resize Handle */}
        {showSidebar && !focusMode && (
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
          <MarkdownEditor ref={editorRef} onOpenKeymapsModal={() => setShowKeymapsModal(true)} focusMode={focusMode} />
        </div>
      </div>
      {showOnboarding && <OnboardingModal onSkip={() => setOnboardingDismissed(true)} />}
      {showWorkspaceModal && <WorkspaceRequiredModal />}
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
      <SearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSelectResult={handleSearchResultSelect}
      />
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onExecuteCommand={handleCommandExecute}
      />
      <NotificationToast />
      {renamingItem && (
        <RenameDialog
          item={renamingItem}
          onSubmit={handleRenameSubmit}
          onCancel={() => setRenamingItem(null)}
        />
      )}
      {closeConfirmation && (
        <ConfirmDialog
          isOpen={true}
          title="Unsaved Changes"
          message={`Do you want to save changes to "${closeConfirmation.noteName}" before closing?`}
          confirmLabel="Save & Close"
          cancelLabel="Discard"
          variant="warning"
          onConfirm={async () => {
            try {
              // Save the note before closing
              const prevNoteId = currentNoteId;
              selectNote(closeConfirmation.noteId);
              await useNotesStore.getState().saveCurrentNoteToDisk();
              closeNote(closeConfirmation.noteId);
              // Restore previous selection if it wasn't the one we closed
              if (prevNoteId !== closeConfirmation.noteId) {
                selectNote(prevNoteId);
              }
              setCloseConfirmation(null);
            } catch (error) {
              console.error('Failed to save note:', error);
              alert('Failed to save: ' + error.message);
            }
          }}
          onCancel={() => {
            closeNote(closeConfirmation.noteId);
            setCloseConfirmation(null);
          }}
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
