import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// Syntax highlight palettes keyed by theme type.
// Each palette defines colors for the main token categories.
export const SYNTAX_PALETTES = {
  dark: {
    emphasis: '#d4d4d4',
    strong: '#d4d4d4',
    monospace: '#ce9178',
    quote: '#858585',
    list: '#d4d4d4',
    meta: '#858585',
    keyword: '#569cd6',
    string: '#ce9178',
    comment: '#858585',
  },
  light: {
    emphasis: '#374151',
    strong: '#374151',
    monospace: '#b45309',
    quote: '#6b7280',
    list: '#374151',
    meta: '#9ca3af',
    keyword: '#1d4ed8',
    string: '#b45309',
    comment: '#9ca3af',
  },
  'gruvbox-dark': {
    emphasis: '#ebdbb2',
    strong: '#ebdbb2',
    monospace: '#d65d0e',
    quote: '#928374',
    list: '#ebdbb2',
    meta: '#928374',
    keyword: '#458588',
    string: '#d65d0e',
    comment: '#928374',
  },
  'gruvbox-light': {
    emphasis: '#3c3836',
    strong: '#3c3836',
    monospace: '#af3a03',
    quote: '#7c6f64',
    list: '#3c3836',
    meta: '#7c6f64',
    keyword: '#076678',
    string: '#af3a03',
    comment: '#7c6f64',
  },
};

// Returns a syntaxHighlighting extension built from the given palette.
// The `accentColor` CSS variable value is used for links/URLs.
export const buildSyntaxHighlighting = (paletteKey = 'dark', accentColor = 'var(--color-accent)') => {
  const palette = SYNTAX_PALETTES[paletteKey] || SYNTAX_PALETTES.dark;
  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: t.heading, color: 'var(--color-text-primary)', fontWeight: 'bold' },
      { tag: t.emphasis, fontStyle: 'italic', color: palette.emphasis },
      { tag: t.strong, fontWeight: 'bold', color: palette.strong },
      { tag: t.link, color: accentColor, textDecoration: 'underline' },
      { tag: t.url, color: accentColor },
      { tag: t.monospace, color: palette.monospace },
      { tag: t.quote, color: palette.quote, fontStyle: 'italic' },
      { tag: t.list, color: palette.list },
      { tag: t.meta, color: palette.meta },
      { tag: t.keyword, color: palette.keyword },
      { tag: t.string, color: palette.string },
      { tag: t.comment, color: palette.comment, fontStyle: 'italic' },
    ])
  );
};

// Theme using Marky's CSS variables for dynamic theme support
export const markyTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--color-bg-editor)',
    color: 'var(--color-text-primary)',
    height: '100%',
    fontSize: '15px',
    fontFamily: 'var(--font-family-mono)',
  },
  '.cm-content': {
    caretColor: 'var(--color-accent)',
    padding: '1.5rem',
    lineHeight: '1.75',
  },
  '.cm-rtl-line': {
    textAlign: 'right',
  },
  '&.cm-focused .cm-cursor, .cm-cursor, &.cm-focused .cm-dropCursor, .cm-dropCursor': {
    borderInlineStartColor: 'var(--color-accent)',
    borderInlineStartWidth: '2px',
  },
  // Selection backgrounds - always use theme accent color
  '.cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 40%, transparent) !important',
    color: 'var(--color-text-primary) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 50%, transparent) !important',
    color: 'var(--color-text-primary) !important',
  },
  // Override browser default selection
  '& ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 50%, transparent) !important',
    color: 'var(--color-text-primary) !important',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--color-bg-sidebar)',
    color: 'var(--color-text-muted)',
    border: 'none',
    paddingInlineEnd: '0.5rem',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--color-item-hover)',
  },
  // Hide active line gutter highlight when there's a selection
  '&.cm-has-selection .cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    paddingBlock: '0',
    paddingInlineStart: '1rem',
    paddingInlineEnd: '0.5rem',
    fontSize: '13px',
  },
  // Active line background - visible when no selection exists
  '.cm-activeLine': {
    backgroundColor: 'var(--color-item-hover)',
  },
  // Hide active line background when there's a selection so selection is visible
  '&.cm-has-selection .cm-activeLine': {
    backgroundColor: 'transparent !important',
  },
  '.cm-searchMatch': {
    backgroundColor: 'rgba(251, 191, 36, 0.3)',
    outline: '1px solid rgba(251, 191, 36, 0.5)',
  },
  '.cm-searchMatch-selected': {
    backgroundColor: 'rgba(251, 191, 36, 0.5)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'rgba(251, 191, 36, 0.6)',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 20%, transparent)',
    outline: '1px solid var(--color-accent)',
  },
  '.cm-nonmatchingBracket': {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    outline: '1px solid rgba(239, 68, 68, 0.5)',
  },
  '.cm-placeholder': {
    color: 'var(--color-text-muted)',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--color-overlay-light)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    padding: '0 0.5em',
    borderRadius: '3px',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--color-titlebar-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
  },
  '.cm-tooltip-autocomplete': {
    '& > ul > li[aria-selected]': {
      backgroundColor: 'var(--color-accent)',
      color: '#ffffff',
    },
  },

  // Search panel styling for CodeMirror's built-in find/replace UI
  '.cm-panels-top, .cm-panels-bottom': {
    padding: '0.75rem',
    border: 'none',
    background: 'transparent',
  },
  '.cm-panel.cm-search': {
    width: 'min(760px, calc(100% - 1rem))',
    margin: '0 auto',
    padding: '16px',
  },
  '.cm-search': {
    position: 'relative',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.625rem',
    '--search-accent': 'var(--color-accent)',
    '--search-accent-hover': 'var(--color-accent-hover)',
    backgroundColor: 'var(--color-bg-sidebar)',
    border: '1px solid var(--color-border)',
    borderRadius: '14px',
    padding: '3.75rem 5.5rem 1rem 0.875rem',
    boxShadow: '0 10px 24px rgba(0, 0, 0, 0.2)',
  },
  '.cm-search br': {
    flexBasis: '100%',
    height: 0,
    content: '""',
  },
  '.cm-search input:not([type="checkbox"])': {
    appearance: 'none',
    WebkitAppearance: 'none',
    height: '2.5rem',
    backgroundColor: 'var(--color-overlay-subtle)',
    border: '1px solid var(--color-overlay-subtle)',
    borderRadius: '10px',
    color: 'var(--color-text-primary)',
    padding: '0 0.95rem',
    fontSize: '13px',
    fontWeight: '400',
    outline: 'none',
    transition: 'border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease',
  },
  '.cm-search input[name="search"]': {
    flex: '1 1 18rem',
    minWidth: '12rem',
  },
  '.cm-search input[name="replace"]': {
    flex: '1 1 16rem',
    minWidth: '12rem',
  },
  '.cm-search input:not([type="checkbox"])::placeholder': {
    color: 'var(--color-text-muted)',
  },
  '.cm-search input:not([type="checkbox"]):hover': {
    backgroundColor: 'var(--color-overlay-light)',
    borderColor: 'var(--color-overlay-light)',
  },
  '.cm-search input:not([type="checkbox"]):focus': {
    backgroundColor: 'color-mix(in srgb, var(--color-overlay-light) 88%, transparent)',
    borderColor: 'color-mix(in srgb, var(--search-accent) 50%, transparent)',
    boxShadow: '0 0 0 3px color-mix(in srgb, var(--search-accent) 12%, transparent)',
  },
  '.cm-search button': {
    appearance: 'none',
    WebkitAppearance: 'none',
    backgroundImage: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '2.5rem',
    borderRadius: '14px',
    border: '1px solid var(--color-overlay-subtle)',
    backgroundColor: 'var(--color-overlay-subtle)',
    color: 'var(--color-text-primary)',
    padding: '0 1.2rem',
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.04em',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: 'transform 0.16s ease, border-color 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease',
    boxShadow: 'none',
  },
  '.cm-search button:hover': {
    transform: 'none',
    borderColor: 'var(--color-overlay-light)',
    backgroundColor: 'var(--color-overlay-light)',
  },
  '.cm-search button:active': {
    transform: 'translateY(0)',
    boxShadow: 'none',
  },
  '.cm-search button:focus-visible': {
    outline: 'none',
    borderColor: 'color-mix(in srgb, var(--search-accent) 50%, transparent)',
    boxShadow: '0 0 0 3px color-mix(in srgb, var(--search-accent) 12%, transparent)',
  },
  '.cm-search button[name="next"], .cm-search button[name="replace"]': {
    minWidth: '8.75rem',
    borderColor: 'var(--search-accent)',
    backgroundColor: 'var(--search-accent)',
    color: '#ffffff',
  },
  '.cm-search button[name="next"]:hover, .cm-search button[name="replace"]:hover': {
    borderColor: 'var(--search-accent-hover)',
    backgroundColor: 'var(--search-accent-hover)',
  },
  '.cm-search button[name="prev"], .cm-search button[name="replaceAll"]': {
    minWidth: '11rem',
    borderColor: 'color-mix(in srgb, var(--search-accent) 28%, transparent)',
    backgroundColor: 'var(--color-overlay-subtle)',
    color: 'var(--search-accent)',
  },
  '.cm-search button[name="prev"]:hover, .cm-search button[name="replaceAll"]:hover': {
    borderColor: 'color-mix(in srgb, var(--search-accent) 36%, transparent)',
    backgroundColor: 'var(--color-overlay-light)',
    color: 'color-mix(in srgb, var(--search-accent) 90%, white)',
  },
  '.cm-search button[name="select"]': {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    color: 'var(--search-accent)',
    paddingInline: '0.25rem',
  },
  '.cm-search button[name="select"]:hover': {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    color: 'color-mix(in srgb, var(--search-accent) 90%, white)',
  },
  '.cm-search button[name="close"]': {
    display: 'none',
  },
  '.cm-search button[name="close"]:hover': {
    background: 'var(--color-overlay-light)',
    color: 'var(--color-text-primary)',
    transform: 'none',
    boxShadow: 'none',
  },
  '.cm-search label': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    minHeight: '2.25rem',
    padding: '0.4rem 0.7rem',
    borderRadius: '999px',
    border: '1px solid var(--color-overlay-subtle)',
    background: 'var(--color-overlay-subtle)',
    color: 'var(--color-text-secondary)',
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: 'border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease, transform 0.16s ease',
  },
  '.cm-search label:hover': {
    color: 'var(--color-text-primary)',
    borderColor: 'var(--color-overlay-light)',
    background: 'var(--color-overlay-light)',
  },
  '.cm-search label:has(input:checked)': {
    color: 'var(--search-accent)',
    borderColor: 'color-mix(in srgb, var(--search-accent) 28%, transparent)',
    background: 'color-mix(in srgb, var(--search-accent) 14%, transparent)',
  },
  '.cm-search label input[type="checkbox"]': {
    appearance: 'none',
    margin: 0,
    width: '1rem',
    height: '1rem',
    borderRadius: '999px',
    border: '1px solid var(--color-overlay-medium)',
    background: 'transparent',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    transition: 'border-color 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease',
  },
  '.cm-search label input[type="checkbox"]::before': {
    content: '""',
    width: '0.45rem',
    height: '0.45rem',
    borderRadius: '999px',
    background: '#ffffff',
    transform: 'scale(0)',
    transition: 'transform 0.16s ease',
  },
  '.cm-search label input[type="checkbox"]:checked': {
    background: 'var(--search-accent)',
    borderColor: 'var(--search-accent)',
    boxShadow: '0 0 0 3px color-mix(in srgb, var(--search-accent) 10%, transparent)',
  },
  '.cm-search label input[type="checkbox"]:checked::before': {
    transform: 'scale(1)',
  },
  '.cm-search label input[type="checkbox"]:focus-visible': {
    outline: 'none',
    boxShadow: '0 0 0 3px color-mix(in srgb, var(--search-accent) 10%, transparent)',
  },
  '.cm-panels-bottom': {
    borderRadius: '14px',
  }
}, { dark: true });

// Markdown syntax highlighting - using only well-defined tags
// Default syntax highlighting (dark palette) — used as initial value before theme is applied.
// Use buildSyntaxHighlighting(paletteKey) to get a theme-matched instance.
export const markySyntaxHighlighting = buildSyntaxHighlighting('dark');
// Map a Marky theme ID to the corresponding syntax palette key
export const themeIdToPaletteKey = (themeId) => {
  if (themeId === 'gruvbox-dark') return 'gruvbox-dark';
  if (themeId === 'gruvbox-light') return 'gruvbox-light';
  // light-type themes (Snow, Gruvbox Light, etc.)
  const lightThemes = ['light'];
  if (lightThemes.includes(themeId)) return 'light';
  return 'dark';
};

// Default syntax highlighting (dark palette) — used as initial value before theme is applied.
