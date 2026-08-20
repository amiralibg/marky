/**
 * The rules behind multi-select in the sidebar tree.
 *
 * Kept out of the component because these are the parts that are easy to get
 * wrong — a range that runs backwards, a folder deleted before the note inside
 * it — and they are worth testing directly.
 */

/**
 * The ids a Shift-click covers: every row between the anchor and the row that
 * was clicked, in the order they appear on screen.
 *
 * `orderedIds` is the flattened, visible tree, so a collapsed folder's contents
 * are not swept up by a range that spans it. With no usable anchor the click
 * selects its own row, which is what a first Shift-click should do.
 */
export const selectRangeIds = (orderedIds, anchorId, itemId) => {
  const from = orderedIds.indexOf(anchorId ?? itemId);
  const to = orderedIds.indexOf(itemId);

  if (from === -1 || to === -1) return [itemId];

  const [start, end] = from <= to ? [from, to] : [to, from];
  return orderedIds.slice(start, end + 1);
};

/**
 * The items an action triggered on `item` should apply to.
 *
 * A row inside the selection acts on the whole selection; a row outside it acts
 * on itself alone, which is what right-clicking elsewhere means in every file
 * browser. Descendants of a selected folder drop out: the folder already takes
 * them along, and deleting one twice fails the second time.
 */
export const resolveSelectionTargets = (items, selectedIds, item) => {
  if (!item) return [];
  if (!selectedIds || selectedIds.size <= 1 || !selectedIds.has(item.id)) return [item];

  const byId = new Map(items.map((entry) => [entry.id, entry]));

  const hasSelectedAncestor = (entry) => {
    const seen = new Set();
    let parentId = entry.parentId ?? null;
    while (parentId && !seen.has(parentId)) {
      if (selectedIds.has(parentId)) return true;
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return false;
  };

  return items.filter((entry) => selectedIds.has(entry.id) && !hasSelectedAncestor(entry));
};

/** Drop ids whose rows no longer exist, so a stale selection cannot linger. */
export const pruneSelection = (selectedIds, items) => {
  if (!selectedIds || selectedIds.size === 0) return selectedIds;

  const alive = new Set(items.map((entry) => entry.id));
  const next = new Set();
  selectedIds.forEach((id) => {
    if (alive.has(id)) next.add(id);
  });

  return next.size === selectedIds.size ? selectedIds : next;
};
