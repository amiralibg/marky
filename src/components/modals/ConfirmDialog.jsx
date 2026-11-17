import { useEffect, useRef } from "react";
import useModalAccessibility from "../../hooks/useModalAccessibility";

const ConfirmDialog = ({
  isOpen,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  variant = "danger", // 'danger' | 'warning' | 'info'
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef(null);
  useModalAccessibility(isOpen, dialogRef);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        onCancel();
      } else if (e.key === "Enter") {
        onConfirm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  // A destructive confirm is the one place the danger colour fills a button;
  // anything else confirms with the accent.
  const confirmClass = variant === "danger" ? "btn btn-danger-solid" : "btn btn-primary";

  return (
    <>
      <div className="modal-scrim z-100 animate-fade-in" onClick={onCancel} aria-hidden="true" />

      <div className="fixed inset-0 z-100 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={dialogRef}
          className="glass-panel modal-panel w-full max-w-[420px] pointer-events-auto animate-fade-in"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-message"
          tabIndex={-1}
        >
          <div className="px-6 pt-6">
            <h3 id="confirm-dialog-title" className="modal-title">
              {title}
            </h3>
            <p
              id="confirm-dialog-message"
              className="mt-2 text-[13.5px] leading-relaxed text-text-secondary"
            >
              {message}
            </p>
          </div>

          <div className="modal-footer pt-6">
            <button type="button" onClick={onCancel} className="btn">
              {cancelLabel}
            </button>
            <button type="button" onClick={onConfirm} className={confirmClass} autoFocus>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ConfirmDialog;
