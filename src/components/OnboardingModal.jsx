import { useState } from 'react';
import { openFolder } from '../utils/fileSystem';
import useNotesStore from '../store/notesStore';

function OnboardingModal() {
  const { loadFolderFromSystem } = useNotesStore();
  const [isLoading, setIsLoading] = useState(false);

  const handleSelectWorkspace = async () => {
    try {
      setIsLoading(true);
      const folderData = await openFolder();
      if (folderData) {
        await loadFolderFromSystem(folderData);
      }
    } catch (error) {
      console.error('Failed to open folder:', error);
      alert('Failed to open folder: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-titlebar-bg border border-border rounded-lg shadow-2xl max-w-2xl w-full mx-4 p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-3">Welcome to Marky</h1>
          <p className="text-white/70 text-lg">
            Pick the folder that will hold every note. Marky reads and writes straight to disk.
          </p>
        </div>

        {/* Getting Started */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">Select Your Notes Folder</h2>
          <p className="text-white/60 mb-6">
            Marky works directly with the files on your machine. Choose the folder that contains
            (or will contain) all of your markdown notes. You can reorganize files in the sidebar,
            and the changes will immediately reflect on disk.
          </p>

          <button
            onClick={handleSelectWorkspace}
            disabled={isLoading}
            className="group flex items-center gap-4 px-5 py-4 bg-editor-bg hover:bg-sidebar-bg border border-border hover:border-accent rounded-lg transition-all text-left disabled:opacity-60"
          >
            <div className="shrink-0 w-12 h-12 bg-accent/20 rounded-lg flex items-center justify-center group-hover:bg-accent/30 transition-colors">
              <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold mb-1">{isLoading ? 'Opening…' : 'Choose Notes Folder'}</h3>
              <p className="text-white/60 text-sm">
                Select the root directory for your workspace. Existing markdown files will appear instantly.
              </p>
            </div>
          </button>
        </div>

        {/* Tips */}
        <div className="bg-editor-bg border border-border rounded-lg p-4">
          <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
            <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            How it works
          </h3>
          <ul className="text-white/60 text-sm space-y-2 list-disc list-inside">
            <li>Every file action (create, rename, move, delete) is mirrored directly on your drive.</li>
            <li>Use Finder/Explorer alongside Marky—both stay in sync.</li>
            <li>You can change the workspace folder anytime from the sidebar toolbar.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default OnboardingModal;
