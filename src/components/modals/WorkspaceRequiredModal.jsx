import { useState } from "react";
import { openFolder } from "../../utils/fileSystem";
import useNotesStore from "../../store/notesStore";
import useUIStore from "../../store/uiStore";
import { BusyButton } from "../ui/Loading";

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
      console.error("Failed to open folder:", error);
      addNotification("Failed to open folder: " + error.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-scrim animate-fade-in" aria-hidden="true" />
      <div
        className="glass-panel modal-panel relative w-full max-w-[420px] animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-required-title"
      >
        <div className="px-6 pt-6">
          <h2 id="workspace-required-title" className="modal-title">
            Choose a workspace first
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-text-secondary">
            Marky saves notes as files in a folder on your computer. Pick a folder, new or one that
            already holds markdown files, before creating notes.
          </p>
        </div>
        <div className="modal-footer pt-6">
          <button type="button" onClick={() => setShowWorkspaceModal(false)} className="btn">
            Cancel
          </button>
          <BusyButton
            onClick={handleImportFolder}
            busy={isLoading}
            className="btn btn-primary"
            autoFocus
          >
            Open a folder
          </BusyButton>
        </div>
      </div>
    </div>
  );
}

export default WorkspaceRequiredModal;
