/**
 * Scrollbars that only show while something is scrolling — the macOS overlay
 * behaviour, on every platform. Windows and most Linux desktops draw classic
 * always-on bars, and even the hover-to-reveal treatment kept a bar on screen
 * whenever the pointer rested over a pane.
 *
 * One capture-phase listener marks whichever element just scrolled with
 * `data-scrolling`; index.css paints a thumb only on marked elements. The mark
 * clears shortly after the last scroll event, so the bar fades out again.
 */
export const SCROLL_IDLE_MS = 900;

export const installQuietScrollbars = (root = document) => {
  const timers = new WeakMap();

  const onScroll = (event) => {
    const target =
      event.target === root || event.target === root.documentElement
        ? root.scrollingElement || root.documentElement
        : event.target;
    if (!(target instanceof Element)) return;

    if (!target.hasAttribute("data-scrolling")) target.setAttribute("data-scrolling", "");
    clearTimeout(timers.get(target));
    timers.set(
      target,
      setTimeout(() => target.removeAttribute("data-scrolling"), SCROLL_IDLE_MS)
    );
  };

  root.addEventListener("scroll", onScroll, { capture: true, passive: true });
  return () => root.removeEventListener("scroll", onScroll, { capture: true });
};
