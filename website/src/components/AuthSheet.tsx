import { X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/feedback";

function AuthForm({ startInRegister, onDone }: { startInRegister: boolean; onDone?: () => void }) {
  const auth = useAuth();
  const [mode, setMode] = useState<"login" | "register">(startInRegister ? "register" : "login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstField.current?.focus();
  }, [mode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      if (mode === "register") {
        await auth.register({
          displayName: String(data.get("displayName") ?? ""),
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? ""),
        });
      } else {
        await auth.login({
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? ""),
        });
      }
      onDone?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-sm border border-line bg-canvas px-3 py-2.5 text-[14px] outline-none transition-colors placeholder:text-ink-faint focus:border-accent";

  return (
    <form onSubmit={submit} className="space-y-3">
      {mode === "register" && (
        <input
          ref={firstField}
          name="displayName"
          required
          minLength={2}
          maxLength={40}
          placeholder="Display name"
          className={inputClass}
          autoComplete="name"
        />
      )}
      <input
        ref={mode === "login" ? firstField : undefined}
        name="email"
        type="email"
        required
        placeholder="Email"
        className={inputClass}
        autoComplete="email"
      />
      <input
        name="password"
        type="password"
        required
        minLength={8}
        placeholder="Password (8+ characters)"
        className={inputClass}
        autoComplete={mode === "register" ? "new-password" : "current-password"}
      />
      {error && <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="btn-accent inline-flex h-10 w-full items-center justify-center rounded-sm text-[14px] font-medium transition-colors duration-200 disabled:opacity-60"
      >
        {busy ? "…" : mode === "register" ? "Create account" : "Sign in"}
      </button>
      <p className="pt-1 text-center text-[13px] text-ink-faint">
        {mode === "login" ? "New here?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="font-medium text-accent-text hover:underline"
        >
          {mode === "login" ? "Create an account" : "Sign in instead"}
        </button>
      </p>
    </form>
  );
}

/**
 * Sign-in / sign-up overlay. A bottom sheet on phones — thumbs live there —
 * and a centred modal from sm up. Escape and the backdrop both dismiss it.
 */
export default function AuthSheet({
  open,
  onClose,
  intent = "signin",
}: {
  open: boolean;
  onClose: () => void;
  /** Preselects the tab: voting opens sign-in; "join" buttons open register. */
  intent?: "signin" | "register";
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // The page behind the sheet should not scroll under a dragging thumb.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-dusk/45 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={intent === "register" ? "Create account" : "Sign in"}
        className="sheet-pop absolute inset-x-0 bottom-0 rounded-t-md border border-b-0 border-line bg-surface p-6 pb-8 shadow-[0_-12px_40px_-12px_rgb(28_27_24/0.35)] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[26rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-md sm:border-b sm:shadow-[0_24px_48px_-20px_rgb(28_27_24/0.4)]"
      >
        {/* Drag-handle affordance — mobile only, purely decorative. */}
        <span
          aria-hidden
          className="mx-auto mb-5 block h-1 w-10 rounded-pill bg-ink/15 sm:hidden"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 hidden h-8 w-8 items-center justify-center rounded-pill text-ink-faint transition-colors hover:bg-ink/[0.06] hover:text-ink sm:inline-flex"
        >
          <X size={16} aria-hidden />
        </button>

        <h2 className="font-display text-[26px] tracking-[-0.02em]">
          {intent === "register" ? "Join the board." : "Welcome back."}
        </h2>
        <p className="mt-2 text-[15px] leading-[1.6] text-ink-soft">
          An account keeps votes honest and shows you when your idea ships.
        </p>
        <div className="mt-6">
          {/* Keyed per intent so the preselected mode follows whichever button opened the sheet. */}
          <AuthForm key={intent} startInRegister={intent === "register"} onDone={onClose} />
        </div>
      </div>
    </div>
  );
}
