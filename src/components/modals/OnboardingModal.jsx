import { useState } from "react";
import { openFolder } from "../../utils/fileSystem";
import useNotesStore from "../../store/notesStore";
import useUIStore from "../../store/uiStore";
import { BusyButton } from "../ui/Loading";

function OnboardingModal({ onSkip }) {
  const { loadFolderFromSystem } = useNotesStore();
  const { addNotification } = useUIStore();
  const [isLoading, setIsLoading] = useState(false);

  const handleSelectWorkspace = async () => {
    try {
      setIsLoading(true);
      const folderData = await openFolder();
      if (folderData) {
        await loadFolderFromSystem(folderData);
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
        className="glass-panel modal-panel relative w-full max-w-[520px] animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <div className="px-8 pt-8">
          <h1
            id="onboarding-title"
            className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-text-primary"
          >
            Welcome to Marky
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">
            Pick the folder that will hold your notes. Marky reads and writes the files in it
            directly, so they stay plain markdown you can open anywhere.
          </p>
          <ul className="mt-6 space-y-2.5 text-[13.5px] leading-relaxed text-text-secondary">
            {[
              "Creating, renaming, moving and deleting in Marky happens to the files on disk.",
              "Finder or Explorer can work alongside Marky; both stay in step.",
              "You can switch to another folder at any time from the top of the sidebar.",
            ].map((tip) => (
              <li key={tip} className="flex gap-3">
                <span
                  className="mt-[0.6em] h-[5px] w-[5px] shrink-0 rounded-full bg-text-muted"
                  aria-hidden="true"
                />
                {tip}
              </li>
            ))}
          </ul>
        </div>
        <div className="modal-footer px-6 pb-6 pt-8">
          <button type="button" onClick={onSkip} className="btn">
            Skip for now
          </button>
          <BusyButton
            onClick={handleSelectWorkspace}
            busy={isLoading}
            className="btn btn-primary"
            autoFocus
          >
            Choose a notes folder
          </BusyButton>
        </div>
      </div>
    </div>
  );
}

export default OnboardingModal;
