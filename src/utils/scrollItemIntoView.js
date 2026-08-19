/**
 * Scroll a list item into view *inside its own container only*.
 *
 * `Element.scrollIntoView` walks every scrollable ancestor, including ones with
 * `overflow: hidden`, so calling it from a modal drags the app shell behind the
 * modal along with it. This adjusts the container's own `scrollTop` instead, so
 * nothing outside the list ever moves.
 */
export function scrollItemIntoView(container, item) {
  if (!container || !item) return;

  const view = container.getBoundingClientRect();
  const rect = item.getBoundingClientRect();

  if (rect.top < view.top) {
    container.scrollTop += rect.top - view.top;
  } else if (rect.bottom > view.bottom) {
    container.scrollTop += rect.bottom - view.bottom;
  }
}

export default scrollItemIntoView;
