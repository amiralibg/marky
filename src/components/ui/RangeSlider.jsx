import { useEffect, useRef } from "react";

/**
 * The app's slider: a native range input (so it keeps every keyboard and
 * assistive behaviour the platform gives it) in the `.range` style from
 * index.css — flat track, accent fill, a round thumb.
 *
 * Two callbacks, because live and committed are different costs:
 * - `onInput` fires on every step while dragging or pressing an arrow key.
 *   Use it for what has to follow the thumb (a CSS variable, a draft value).
 * - `onCommit` fires on the native `change` event: the end of a drag, each
 *   key press, a click on the track. Persist here. React's `onChange` is the
 *   input event for range inputs, so the native one is listened to directly.
 */
const RangeSlider = ({
  value,
  min = 0,
  max = 100,
  step = 1,
  onInput,
  onCommit,
  className = "",
  ...inputProps
}) => {
  const inputRef = useRef(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return undefined;
    const handleChange = () => commitRef.current?.(Number(input.value));
    input.addEventListener("change", handleChange);
    return () => input.removeEventListener("change", handleChange);
  }, []);

  const span = max - min;
  const fill = span > 0 ? Math.min(1, Math.max(0, (Number(value) - min) / span)) : 0;

  return (
    <div className={`range ${className}`} style={{ "--range-fill": fill }}>
      <input
        ref={inputRef}
        type="range"
        className="range-input"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onInput?.(Number(event.target.value))}
        {...inputProps}
      />
    </div>
  );
};

export default RangeSlider;
