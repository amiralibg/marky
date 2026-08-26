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

/**
 * Where a paste on `item` lands: a folder takes the paste itself; anything
 * else pastes into that row's own folder. Null means workspace root.
 */
export const resolvePasteDestination = (items, item) => {
  if (!item) return null;
  if (item.type === "folder") return item;
  return items.find((entry) => entry.id === item.parentId) ?? null;
};

/**
 * Clipboard rows that can actually be pasted at `destination`.
 *
 * A folder pasted into itself or one of its own descendants would either
 * fail on disk or nest a copy inside its copy — both are dropped up front.
 * A cut row pasted where it already lives moves nothing, so it drops out
 * too; a copied row in the same spot is still wanted (it makes a duplicate).
 */
export const filterPasteTargets = (clipboardItems, destination, mode = "copy") => {
  const rows = clipboardItems ?? [];
  const destPath = destination?.filePath;
  if (!destPath) return rows;

  return rows.filter((entry) => {
    if (!entry.filePath) return true;
    if (mode === "cut" && (entry.parentId ?? null) === (destination?.id ?? null)) return false;
    if (entry.filePath === destPath) return false;
    return !destPath.startsWith(`${entry.filePath}/`);
  });
};

/**
 * The ids Cmd+A covers when a tree row has focus: every child of a focused
 * folder, otherwise every sibling the row shares a parent with. Root rows
 * select the whole root level — matching how explorers scope Select All to
 * the folder you are looking at rather than the entire vault.
 */
export const selectFolderContents = (items, item) => {
  if (!item) return [];
  const parentId = item.type === "folder" ? item.id : (item.parentId ?? null);
  return items.filter((entry) => (entry.parentId ?? null) === parentId).map((entry) => entry.id);
};
