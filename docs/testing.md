# Testing Guide

Marky uses Vitest for unit tests and React Testing Library for component tests.
The goal is to protect local-first note workflows without making tests brittle.

## Commands

```bash
pnpm test
pnpm test:watch
pnpm lint
pnpm build
```

Run `pnpm test` before opening a PR or cutting a release. Use `pnpm test:watch`
while developing a feature.

## Test File Placement

- Put utility tests next to the source file, for example `src/utils/diff.test.js`.
- Put component tests next to the component, for example `src/components/modals/SearchModal.test.jsx`.
- Put shared setup in `src/test/setup.js`.
- Name test files `*.test.js` or `*.test.jsx`.

## What To Test

Prioritize behavior that can lose user data, change files, or break navigation.

### Highest Priority

- **Notes store actions:** creating, renaming, deleting, moving, pinning, recents, dirty state, and tab state.
- **Scheduling logic:** daily/weekly/monthly next-run calculations, disabled schedules, missed runs, and generated note names.
- **Metadata parsing:** tags, wiki links, aliases, backlinks, broken links, and orphan notes.
- **File operation flows:** mocked create/read/write/rename/delete/move behavior, permission errors, missing paths, and conflicts.
- **Backup/restore:** manifest/settings handling, unsafe ZIP path rejection, existing-file skip behavior, and settings/templates import validation.

### Medium Priority

- **Search and command palette:** filters, exact/case/regex modes, keyboard navigation, and result activation.
- **Dashboard stats:** word counts, top tags, broken links, orphan notes, and recent activity.
- **Export:** standalone HTML escaping, batch export paths, graph SVG escaping, and PDF save cancellation.
- **Settings:** persistence, toggles, workspace profiles, keymap customization, and import/export.
- **Accessibility:** modal labels, focus traps, live regions, tree/listbox semantics, and keyboard-only flows.

## How To Write Tests

### Utility Tests

Use utility tests for pure functions. These should be fast and deterministic.

```js
import { describe, expect, it } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("creates a heading anchor", () => {
    expect(slugify("My Heading")).toBe("my-heading");
  });
});
```

Prefer explicit examples over snapshots. Include edge cases like empty input,
unicode, duplicate values, unsafe paths, and missing fields.

### Component Tests

Use React Testing Library for user-visible behavior.

```jsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

describe("ExampleModal", () => {
  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<ExampleModal onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /close/i }));

    expect(onClose).toHaveBeenCalled();
  });
});
```

Query by role, label, and visible text. Avoid querying by CSS class names.

### Store Tests

For Zustand stores, reset store state before each test and mock Tauri file-system
helpers. Test state changes and returned values, not private implementation details.

Recommended store tests:

- `createNote` creates a note in the root workspace and selects it.
- `renameItem` rejects duplicate names and updates paths.
- `deleteItem` records undo data and removes descendants.
- `getBrokenWikiLinks` groups unresolved targets by source note.
- Scheduled notes calculate next run dates correctly.

### Mocking Tauri APIs

Tauri APIs should be mocked in unit/component tests:

```js
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));
```

Only use real Tauri APIs in future integration/smoke tests.

## Current Coverage

Current tests cover:

- `src/utils/workspaceStats.js`
- `src/utils/diff.js`
- `src/utils/slugify.js`
- `src/utils/noteExport.js`
- `src/utils/graphExport.js`
- `src/utils/schedule.js`
- `src/utils/dailyNotes.js`
- `src/data/templates.js`
- `src/store/notesStore.js`

Next recommended coverage:

1. Extract metadata helpers from `src/store/notesStore.js` and test tags/wiki links/backlinks directly.
2. Add file-backed notes store action tests for create/rename/delete/move with mocked file-system functions.
3. Add component tests for `SearchModal`, `CommandPalette`, `ConfirmDialog`, and dashboard tabs.
4. Add backup/restore tests with mocked dialogs, file system, and ZIP fixtures.
5. Add integration smoke tests for Tauri file operations once the unit surface is stable.
