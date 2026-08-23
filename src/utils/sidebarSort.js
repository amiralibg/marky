/**
 * Sidebar tree sibling ordering.
 *
 * Lives outside the Sidebar component so the ordering rules are unit-testable
 * without mounting the whole tree.
 *
 * `pinnedIds` is a Set of note ids (or null). Pinned notes float above
 * everything else in their sibling group — that is what "Pin to top" promises —
 * while keeping the same relative order among themselves as the active sort.
 */
export const sortSidebarItems = (entries, sortBy, isRootLevel = false, pinnedIds = null) => {
  const items = [...entries];
  return items.sort((a, b) => {
    const ap = pinnedIds?.has(a.id) ?? false;
    const bp = pinnedIds?.has(b.id) ?? false;
    if (ap !== bp) return ap ? -1 : 1;

    // Manual drag order wins outright (and may interleave files/folders). Once a
    // sibling group has been reordered, reorderItems stamps every sibling with an
    // `order`, so this branch drives the whole group.
    const ao = a.order;
    const bo = b.order;
    if (ao !== undefined && bo !== undefined) return ao - bo;
    if (ao !== undefined) return -1;
    if (bo !== undefined) return 1;

    // No manual order yet: folders first, then by the active sort setting.
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;

    if (!isRootLevel) {
      return a.name.localeCompare(b.name);
    }

    switch (sortBy) {
      case "name-desc":
        return b.name.localeCompare(a.name);
      case "date-desc":
        return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
      case "date-asc":
        return new Date(a.updatedAt || a.createdAt) - new Date(b.updatedAt || b.createdAt);
      case "name-asc":
      default:
        return a.name.localeCompare(b.name);
    }
  });
};
