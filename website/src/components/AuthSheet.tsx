import { useEffect, useRef, useState, type FormEvent } from "react";
import Sheet from "./Sheet";
import { FIELD_CLASS, PasswordField } from "./Field";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/feedback";

type Mode = "login" | "register";

/**
 * Sign-in / sign-up overlay. A bottom sheet on phones, a centred modal from sm
 * up — both come from <Sheet>, which owns the scroll lock and focus trap.
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
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>(intent === "register" ? "register" : "login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  // Reopening from a different button should land on that button's tab, even if
  // the visitor switched tabs the last time the sheet was up.
  useEffect(() => {
    if (open) {
      setMode(intent === "register" ? "register" : "login");
      setError(null);
    }
  }, [open, intent]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => firstField.current?.focus({ preventScroll: true }), 40);
    return () => window.clearTimeout(timer);
  }, [open, mode]);

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
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign you in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function switchTo(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={mode === "register" ? "Create an account" : "Sign in"}
      description="Posting and voting both need an account. It takes one field more than signing in."
    >
      {/* Segmented switch: both routes visible at once, so nobody has to hunt
          for the one they wanted at the bottom of a form. */}
      <div
        role="group"
        aria-label="Sign in or create an account"
        className="mb-5 grid grid-cols-2 gap-1 rounded-sm border border-line bg-canvas p-1"
      >
        {(
          [
            ["login", "Sign in"],
            ["register", "Create account"],
          ] as Array<[Mode, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => switchTo(value)}
            className={`rounded-[5px] py-2 text-[13px] font-medium transition-colors duration-200 ${
              mode === value
                ? "bg-surface text-ink shadow-[0_1px_2px_rgb(28_27_24/0.08)]"
                : "text-ink-faint hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Keyed per mode so React does not carry a half-typed sign-up name into
          the sign-in form (or the browser's autofill into the wrong field). */}
      <form key={mode} onSubmit={submit} className="space-y-3">
        {mode === "register" && (
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Display name</span>
            <input
              ref={firstField}
              name="displayName"
              required
              minLength={2}
              maxLength={40}
              placeholder="Shown on your posts"
              className={FIELD_CLASS}
              autoComplete="name"
            />
          </label>
        )}
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Email</span>
          <input
            ref={mode === "login" ? firstField : undefined}
            name="email"
            type="email"
            required
            className={FIELD_CLASS}
            autoComplete="email"
            inputMode="email"
          />
        </label>
        <PasswordField
          label="Password"
          name="password"
          required
          minLength={8}
          hint={mode === "register" ? "Eight characters or more." : undefined}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
        />

        {error && (
          <p role="alert" className="text-[13px] leading-[1.5] text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="btn-accent inline-flex h-11 w-full items-center justify-center rounded-sm text-[14px] font-medium transition-colors duration-200 disabled:opacity-60"
        >
          {busy
            ? mode === "register"
              ? "Creating…"
              : "Signing in…"
            : mode === "register"
              ? "Create account"
              : "Sign in"}
        </button>

        {mode === "register" && (
          <p className="pt-1 text-[12px] leading-[1.5] text-ink-faint">
            Your email is only used to sign in. No mailing list, no newsletter.
          </p>
        )}
      </form>
    </Sheet>
  );
}
