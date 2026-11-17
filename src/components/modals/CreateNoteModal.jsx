import { useState } from "react";

const CreateNoteModal = ({ isOpen, onClose, onConfirm, noteName }) => {
  const [customName, setCustomName] = useState("");

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(customName || noteName);
    setCustomName("");
    onClose();
  };

  const handleCancel = () => {
    setCustomName("");
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-scrim animate-fade-in" aria-hidden="true" />
      <div
        className="glass-panel modal-panel relative w-full max-w-[420px] animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-note-title"
      >
        <div className="px-6 pt-6">
          <h2 id="create-note-title" className="modal-title">
            Create note
          </h2>
          <p className="modal-subtitle">The link points to a note that does not exist yet.</p>
          <label htmlFor="create-note-name" className="field-label mt-5">
            Name
          </label>
          <input
            id="create-note-name"
            type="text"
            value={customName || noteName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Note name"
            className="field"
            dir="auto"
            autoFocus
          />
          <p className="mt-2 text-[12.5px] text-text-muted">
            A new markdown file is created in your workspace.
          </p>
        </div>
        <div className="modal-footer pt-5">
          <button type="button" onClick={handleCancel} className="btn">
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} className="btn btn-primary">
            Create note
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateNoteModal;
