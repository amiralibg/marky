import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type Props = {
  open: boolean;
  onClose: () => void;
  /** Announced as the dialog's name and rendered as its heading. */
  title: string;
  /** Optional line under the heading. */
  description?: ReactNode;
  children: ReactNode;
  /** Desktop width. Defaults to the sign-in measure. */
  size?: "sm" | "md";
};

/**
 * The site's one overlay: a bottom sheet on phones — thumbs live there — and a
 * centred modal from sm up.
 *
 * Positioning is flexbox on the backdrop, never a transform, so the entrance
 * keyframes can own `transform` outright. It is portalled to <body> because the
 * scroll lock marks #root inert, and a dialog rendered inside #root would make
 * itself unfocusable.
 */
export default function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  size = "sm",
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Where focus came from, so it can be handed back on close.
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;

    // The page behind a modal should be unreachable by Tab and screen readers.
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");

    // overflow-Y only: the stylesheet keeps `overflow-x: clip` on body so the
    // sticky header keeps sticking, and the shorthand would wipe that out. Pad
    // for the scrollbar the lock removes so the page does not jump sideways.
    const { body } = document;
    const previousOverflowY = body.style.overflowY;
    const previousPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflowY = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    // preventScroll: html has scroll-behavior: smooth, so focusing inside a
    // fixed overlay otherwise glides the page behind it.
    const timer = window.setTimeout(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? dialogRef.current)?.focus({ preventScroll: true });
    }, 20);

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      // Keep Tab inside the dialog; `inert` on #root stops it reaching the page
      // but not the browser chrome.
      const nodes = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
      ).filter((node) => node.offsetParent !== null || node === document.activeElement);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      root?.removeAttribute("inert");
      body.style.overflowY = previousOverflowY;
      body.style.paddingRight = previousPadding;
      restoreRef.current?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={onClose}
        className="sheet-backdrop absolute inset-0 cursor-default bg-dusk/50 backdrop-blur-[2px]"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`sheet-pop relative flex max-h-[92vh] w-full flex-col overflow-y-auto overscroll-contain rounded-t-md border border-b-0 border-line bg-surface shadow-[0_-12px_40px_-12px_rgb(28_27_24/0.35)] sm:max-h-[calc(100vh-3rem)] sm:rounded-md sm:border-b sm:shadow-[0_24px_60px_-24px_rgb(28_27_24/0.45)] ${
          size === "md" ? "sm:max-w-[34rem]" : "sm:max-w-[26rem]"
        }`}
      >
        {/* Drag-handle affordance — mobile only, purely decorative. */}
        <span
          aria-hidden
          className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-pill bg-ink/15 sm:hidden"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 hidden h-8 w-8 items-center justify-center rounded-pill text-ink-faint transition-colors hover:bg-ink/[0.06] hover:text-ink sm:inline-flex"
        >
          <X size={16} aria-hidden />
        </button>

        {/* pb keeps the last control clear of a phone's home indicator. */}
        <div className="px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-5 sm:px-7 sm:pb-7 sm:pt-6">
          <h2 className="font-display text-[26px] leading-[1.15] tracking-[-0.02em]">{title}</h2>
          {description && (
            <p className="mt-2 text-[15px] leading-[1.6] text-ink-soft">{description}</p>
          )}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}
