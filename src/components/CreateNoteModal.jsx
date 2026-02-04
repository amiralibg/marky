import { useState } from 'react';

const CreateNoteModal = ({ isOpen, onClose, onConfirm, noteName }) => {
  const [customName, setCustomName] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(customName || noteName);
    setCustomName('');
    onClose();
  };

  const handleCancel = () => {
    setCustomName('');
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
      <div className="bg-bg-sidebar border border-border rounded-lg shadow-2xl max-w-md w-full mx-4 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Create New Note</h2>
              <p className="text-xs text-text-muted">From broken link</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Note Name
            </label>
            <input
              type="text"
              value={customName || noteName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter note name..."
              className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
              autoFocus
            />
            <p className="mt-2 text-xs text-text-muted">
              This will create a new markdown note in your workspace
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-overlay-subtle border-t border-border rounded-b-lg flex items-center justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-overlay-light rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors font-medium shadow-sm"
          >
            Create Note
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateNoteModal;
