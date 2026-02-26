import { EditorView, ViewPlugin, Decoration, keymap, lineNumbers, highlightActiveLine,
         highlightActiveLineGutter, dropCursor, rectangularSelection,
         highlightSpecialChars, drawSelection, placeholder } from '@codemirror/view';
import { EditorState, Prec, RangeSet } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, foldGutter, foldKeymap } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { vim, getCM } from '@replit/codemirror-vim';
import { markyTheme, markySyntaxHighlighting } from './theme';
import { markyKeymaps } from './keymaps';
import { createWikiLinkAutocomplete } from './wikiLinkAutocomplete';

// Regex matching RTL Unicode ranges (Arabic, Hebrew, Persian, Thaana, Syriac, etc.)
const RTL_CHAR = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0780-\u07BF\u0860-\u086F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
// Regex matching LTR characters (Latin, Greek, Cyrillic, CJK, etc.)
const LTR_CHAR = /[A-Za-z\u00C0-\u02AF\u0370-\u03FF\u0400-\u04FF\u1E00-\u1EFF]/;

const rtlLineDeco = Decoration.line({ attributes: { dir: 'rtl', class: 'cm-rtl-line' } });

/**
 * Detect the base direction of a string using first-strong-character heuristic
 * (Unicode Bidi Algorithm rules P2/P3).
 */
function isRTLLine(text) {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (RTL_CHAR.test(ch)) return true;
    if (LTR_CHAR.test(ch)) return false;
  }
  return false;
}

function buildDecorations(view) {
  const decorations = [];
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      if (isRTLLine(line.text)) {
        decorations.push(rtlLineDeco.range(line.from));
      }
      pos = line.to + 1;
    }
  }
  return RangeSet.of(decorations);
}

/**
 * ViewPlugin that adds `dir="rtl"` and alignment to lines whose first
 * strong character is RTL. Updates on doc changes and viewport scrolls.
 */
function bidiLinePlugin() {
  return ViewPlugin.define(
    (view) => ({
      decorations: buildDecorations(view),
      update(update) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view);
        }
      },
    }),
    {
      decorations: (v) => v.decorations,
    }
  );
}

export function createExtensions(options = {}) {
  const {
    readOnly = false,
    placeholderText = '',
    onUpdate = () => {},
    onVimModeChange = () => {},
    enableLineNumbers = true,
    enableSearch = true,
    enableAutocomplete = false,
    enableWikiLinkAutocomplete = true,
    enableVimMode = false,
    getNotes = () => [],
    getTags = () => [],
  } = options;

  const extensions = [
    // Theme and highlighting
    markyTheme,
    markySyntaxHighlighting,

    // Language support
    markdown({
      base: markdownLanguage,
      codeLanguages: [], // Can add language support for code blocks later
    }),

    // BiDi support - auto-detect RTL/LTR per line
    EditorView.perLineTextDirection.of(true),
    bidiLinePlugin(),

    // Visual enhancements
    highlightSpecialChars(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    highlightActiveLine(),
    highlightSelectionMatches(), // Highlight other instances of selected text

    // Toggle .cm-has-selection class so active line bg hides when selecting
    ViewPlugin.define(view => {
      const sync = (state) => {
        const has = state.selection.ranges.some(r => !r.empty);
        view.dom.classList.toggle('cm-has-selection', has);
      };
      sync(view.state);
      return {
        update(update) {
          if (update.selectionSet || update.docChanged) {
            sync(update.state);
          }
        },
      };
    }),

    // Editing features
    history(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),

    // Update listener for React state sync
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onUpdate(update.state.doc.toString());
      }
      
      // Track vim mode changes
      if (enableVimMode && update.view) {
        try {
          // Get vim state from CodeMirror vim extension
          const cm = getCM(update.view);
          if (cm) {
            const mode = cm.state.vim?.mode || 'normal';
            const keyBuffer = cm.state.vim?.inputState?.keyBuffer || '';
            onVimModeChange({ mode, keyBuffer });
          }
        } catch (e) {
          // Vim not initialized yet
        }
      }
    }),
  ];

  // Optional features
  if (enableLineNumbers) {
    extensions.push(
      lineNumbers(),
      highlightActiveLineGutter(),
      foldGutter(),
    );
  }

  if (readOnly) {
    extensions.push(EditorState.readOnly.of(true));
  }

  if (placeholderText) {
    extensions.push(placeholder(placeholderText));
  }

  if (enableAutocomplete) {
    extensions.push(autocompletion());
  }

  // Wiki link autocomplete for [[note]] syntax
  if (enableWikiLinkAutocomplete) {
    extensions.push(createWikiLinkAutocomplete(getNotes, getTags));
  }

  // Vim mode
  if (enableVimMode) {
    extensions.push(vim());
  }

  // Keymaps (order matters - later overrides earlier)
  extensions.push(
    Prec.high(keymap.of(markyKeymaps)), // Custom keymaps highest priority
    keymap.of(closeBracketsKeymap),
    keymap.of(foldKeymap),
    keymap.of(historyKeymap),
    keymap.of(defaultKeymap),
    keymap.of([indentWithTab]),
  );

  if (enableSearch) {
    extensions.push(keymap.of(searchKeymap));
  }

  return extensions;
}
