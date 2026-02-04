import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

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

  // Search panel styling to match Marky's design
  '.cm-search': {
    backgroundColor: 'var(--color-bg-sidebar)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '0.75rem',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
  },
  '.cm-search input': {
    backgroundColor: 'var(--color-bg-editor)',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    color: 'var(--color-text-primary)',
    padding: '0.5rem 0.875rem',
    fontSize: '13px',
    outline: 'none',
    transition: 'all 0.15s ease',
  },
  '.cm-search input:focus': {
    borderColor: 'var(--color-accent)',
    boxShadow: '0 0 0 2px color-mix(in srgb, var(--color-accent) 20%, transparent)',
  },
  '.cm-search button': {
    background: 'linear-gradient(180deg, var(--color-accent) 0%, color-mix(in srgb, var(--color-accent) 85%, black) 100%)',
    border: 'none',
    borderRadius: '6px',
    color: '#ffffff',
    padding: '0.375rem 0.75rem',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 0 0 1px color-mix(in srgb, var(--color-accent) 70%, black)',
    position: 'relative',
    overflow: 'hidden',
  },
  '.cm-search button::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, transparent 100%)',
    pointerEvents: 'none',
  },
  '.cm-search button:hover': {
    background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-accent) 110%, white) 0%, var(--color-accent) 100%)',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 0 0 1px color-mix(in srgb, var(--color-accent) 70%, black)',
    transform: 'translateY(-1px)',
  },
  '.cm-search button:active': {
    background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-accent) 80%, black) 0%, color-mix(in srgb, var(--color-accent) 90%, black) 100%)',
    boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.2)',
    transform: 'translateY(0px)',
  },
  '.cm-search button[name="close"]': {
    position: 'absolute',
    top: '0.5rem',
    right: '0.5rem',
    padding: '0.25rem',
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    background: 'transparent',
    border: 'none',
    boxShadow: 'none',
    color: 'var(--color-text-muted)',
  },
  '.cm-search button[name="close"]::before': {
    display: 'none',
  },
  '.cm-search button[name="close"]:hover': {
    background: 'var(--color-overlay-medium)',
    color: 'var(--color-text-primary)',
    transform: 'none',
    boxShadow: 'none',
  },
  '.cm-search label': {
    color: 'var(--color-text-secondary)',
    fontSize: '12px',
    fontWeight: '500',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    padding: '0.25rem 0',
    transition: 'color 0.15s ease',
  },
  '.cm-search label:hover': {
    color: 'var(--color-text-primary)',
  },
  '.cm-search label input[type="checkbox"]': {
    width: '1rem',
    height: '1rem',
    accentColor: 'var(--color-accent)',
    cursor: 'pointer',
  },
  '.cm-panels-bottom': {
    borderRadius: "8px",
  }
}, { dark: true });

// Markdown syntax highlighting - using only well-defined tags
export const markySyntaxHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    // Headings
    { tag: t.heading, color: 'var(--color-text-primary)', fontWeight: 'bold' },

    // Emphasis
    { tag: t.emphasis, fontStyle: 'italic', color: '#d4d4d4' },
    { tag: t.strong, fontWeight: 'bold', color: '#d4d4d4' },

    // Links and URLs
    { tag: t.link, color: 'var(--color-accent)', textDecoration: 'underline' },
    { tag: t.url, color: 'var(--color-accent)' },

    // Code
    { tag: t.monospace, color: '#ce9178' },

    // Quotes
    { tag: t.quote, color: '#858585', fontStyle: 'italic' },

    // Lists
    { tag: t.list, color: '#d4d4d4' },

    // Meta
    { tag: t.meta, color: '#858585' },

    // Keywords and special
    { tag: t.keyword, color: '#569cd6' },
    { tag: t.string, color: '#ce9178' },
    { tag: t.comment, color: '#858585', fontStyle: 'italic' },
  ])
);
