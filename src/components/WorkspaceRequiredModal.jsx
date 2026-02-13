import { useState } from 'react';
import { openFolder } from '../utils/fileSystem';
import useNotesStore from '../store/notesStore';
import useUIStore from '../store/uiStore';

function WorkspaceRequiredModal() {
  const { loadFolderFromSystem } = useNotesStore();
  const { setShowWorkspaceModal, addNotification } = useUIStore();
  const [isLoading, setIsLoading] = useState(false);

  const handleImportFolder = async () => {
    try {
      setIsLoading(true);
      const folderData = await openFolder();
      if (folderData) {
        await loadFolderFromSystem(folderData);
        setShowWorkspaceModal(false);
      }
    } catch (error) {
      console.error('Failed to open folder:', error);
      addNotification('Failed to open folder: ' + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="glass-panel border-glass-border rounded-lg shadow-2xl max-w-md w-full mx-4 p-6 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start gap-4 mb-5">
          <div className="shrink-0 w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-1">No Workspace Selected</h2>
            <p className="text-text-muted text-sm">
              You need a workspace folder before you can create notes. Marky saves notes directly to your file system.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 mb-5">
          <button
            onClick={handleImportFolder}
            disabled={isLoading}
            className="group flex items-center gap-3 px-4 py-3 bg-bg-editor hover:bg-bg-sidebar border border-border hover:border-accent rounded-lg transition-all text-left disabled:opacity-60 w-full"
          >
            <div className="shrink-0 w-9 h-9 bg-accent/20 rounded-md flex items-center justify-center group-hover:bg-accent/30 transition-colors">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-text-primary text-sm font-medium">{isLoading ? 'Opening…' : 'Import Existing Folder'}</p>
              <p className="text-text-muted text-xs">Pick a folder that already contains your markdown files.</p>
            </div>
          </button>
        </div>

        {/* Cancel */}
        <button
          onClick={() => setShowWorkspaceModal(false)}
          className="w-full py-2 border border-border hover:border-text-muted text-text-muted hover:text-text-secondary rounded-lg text-sm transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default WorkspaceRequiredModal;
