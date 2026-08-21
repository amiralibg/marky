import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type Ref } from "react";

/** The one text-input look: hairline box, accent border on focus. */
export const FIELD_CLASS =
  "w-full rounded-sm border border-line bg-canvas px-3 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent";

type PasswordProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Visible label above the field; also names the reveal button. */
  label?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** Text under the field — the 8-character rule on sign-up, say. */
  hint?: string;
};

/**
 * A password box with a reveal toggle. Typing a passphrase blind on a phone
 * keyboard is where most sign-ins go wrong, so the eye is not optional.
 *
 * The button is deliberately `tabIndex={-1}`: Tab should run field → field →
 * submit, and a reveal control is a pointer affordance sitting in the middle of
 * that path. It stays reachable by click, tap, and screen-reader navigation.
 */
export function PasswordField({ label, inputRef, hint, className, ...rest }: PasswordProps) {
  const [shown, setShown] = useState(false);
  const id = useId();

  return (
    <div>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink-soft">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          {...rest}
          id={id}
          ref={inputRef}
          type={shown ? "text" : "password"}
          className={`${FIELD_CLASS} pr-11 ${className ?? ""}`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShown((value) => !value)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          className="absolute right-1 top-1/2 inline-flex h-8 w-9 -translate-y-1/2 items-center justify-center rounded-sm text-ink-faint transition-colors hover:text-ink"
        >
          {shown ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        </button>
      </div>
      {hint && <p className="mt-1.5 text-[12px] text-ink-faint">{hint}</p>}
    </div>
  );
}
