/**
 * Scroll a list row into view *inside its own container only*.
 *
 * `Element.scrollIntoView` walks every scrollable ancestor up to the document,
 * so calling it from a fixed overlay smooth-scrolls the whole page behind the
 * overlay instead of moving the list. Adjusting the container's own `scrollTop`
 * keeps the movement where it belongs.
 */
export function scrollItemIntoView(container: Element | null, item: Element | null) {
  if (!container || !item) return;

  const view = container.getBoundingClientRect();
  const rect = item.getBoundingClientRect();

  if (rect.top < view.top) {
    container.scrollTop += rect.top - view.top;
  } else if (rect.bottom > view.bottom) {
    container.scrollTop += rect.bottom - view.bottom;
  }
}
