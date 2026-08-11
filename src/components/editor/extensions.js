import {
  EditorView,
  ViewPlugin,
  Decoration,
  Direction,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  dropCursor,
  rectangularSelection,
  highlightSpecialChars,
  drawSelection,
  placeholder,
  tooltips,
} from "@codemirror/view";
import { EditorState, Prec, RangeSet } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput, foldGutter, foldKeymap } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  startCompletion,
} from "@codemirror/autocomplete";
import { vim, getCM } from "@replit/codemirror-vim";
import { setVimVisualLineMotion, vimBlockStepSync } from "./vimSetup";
import { markyTheme, markySyntaxHighlighting } from "./theme";
import { livePreview } from "./livePreview";
import { typewriterMode } from "./typewriterMode";
import { buildMarkyKeymaps } from "./keymaps";
import { createWikiLinkAutocomplete } from "./wikiLinkAutocomplete";
import { isRTLLine, findIsolateRuns } from "../../utils/bidi";

const rtlLineDeco = Decoration.line({ attributes: { dir: "rtl", class: "cm-rtl-line" } });

// Isolate marks for runs that go against their line's base direction. The
// `bidiIsolate` spec is what lets CodeMirror map screen coordinates back to
// document positions; the `dir` attribute is what makes the browser actually
// isolate the run (the HTML UA stylesheet applies `unicode-bidi: isolate` to
// any element carrying a `dir` attribute).
const rtlIsolateDeco = Decoration.mark({
  bidiIsolate: Direction.RTL,
  attributes: { dir: "rtl", class: "cm-bidi-isolate" },
});
const ltrIsolateDeco = Decoration.mark({
  bidiIsolate: Direction.LTR,
  attributes: { dir: "ltr", class: "cm-bidi-isolate" },
});

function buildDecorations(view) {
  const lineDecos = [];
  const isolateDecos = [];

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const isRTL = isRTLLine(line.text);
      if (isRTL) {
        lineDecos.push(rtlLineDeco.range(line.from));
      }
      if (line.length) {
        const deco = isRTL ? ltrIsolateDeco : rtlIsolateDeco;
        for (const run of findIsolateRuns(line.text, isRTL ? "rtl" : "ltr")) {
          isolateDecos.push(deco.range(line.from + run.start, line.from + run.end));
        }
      }
      pos = line.to + 1;
    }
  }

  return {
    // Isolates are mark decorations and line decorations sit at line starts, so
    // the combined set needs sorting.
    decorations: Decoration.set([...lineDecos, ...isolateDecos], true),
    isolates: RangeSet.of(isolateDecos),
  };
}

/**
 * ViewPlugin that adds `dir="rtl"` to lines whose first strong character is
 * RTL, and wraps opposite-direction runs inside each line in bidi isolates so
 * mixed English/Persian lines keep the order they were typed in.
 */
const bidiPlugin = ViewPlugin.define(
  (view) => ({
    ...buildDecorations(view),
    update(update) {
      if (update.docChanged || update.viewportChanged) {
        Object.assign(this, buildDecorations(update.view));
      }
    },
  }),
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.bidiIsolatedRanges.of((view) => view.plugin(plugin)?.isolates ?? Decoration.none),
  }
);

export function createExtensions(options = {}) {
  const {
    readOnly = false,
    placeholderText = "",
    onUpdate = () => {},
    onVimModeChange = () => {},
    enableLineNumbers = true,
    enableSearch = true,
    editorSearchKeymap = null,
    enableAutocomplete = false,
    enableWikiLinkAutocomplete = true,
    enableVimMode = false,
    vimVisualLineMotion = true,
    enableTypewriterMode = false,
    enableLivePreview = false,
    formattingKeymaps = {},
    getNotes = () => [],
    getTags = () => [],
  } = options;

  const filteredSearchKeymap = searchKeymap.filter((binding) => binding.key !== "Mod-f");

  const extensions = [
    // Theme and highlighting
    markyTheme,
    markySyntaxHighlighting,

    // Language support
    markdown({
      base: markdownLanguage,
      codeLanguages: [], // Can add language support for code blocks later
    }),

    // BiDi support - auto-detect RTL/LTR per line, isolate mixed-script runs
    EditorView.perLineTextDirection.of(true),
    bidiPlugin,

    // Soft-wrap long lines (no horizontal scroll / cut-off text) — Notion-style.
    EditorView.lineWrapping,

    // Render tooltips (wiki-link + slash-command completions) into <body>
    // rather than into `.cm-editor`. The editor sits inside `EditorScrollFade`,
    // whose `mask-image` clips its descendants and neutralises their
    // `backdrop-filter` — a tooltip opened near the top or bottom of the
    // viewport would fade out along with the text behind it.
    tooltips({ parent: document.body }),

    // Visual enhancements
    highlightSpecialChars(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    highlightSelectionMatches(), // Highlight other instances of selected text

    // Toggle .cm-has-selection class so active line bg hides when selecting
    ViewPlugin.define((view) => {
      const sync = (state) => {
        const has = state.selection.ranges.some((r) => !r.empty);
        view.dom.classList.toggle("cm-has-selection", has);
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

    // Open the "/" slash-command menu as soon as "/" is typed at line start.
    // autocompletion's activateOnTyping only fires on word characters, so "/"
    // needs an explicit trigger.
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      let typedSlash = false;
      update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
        if (inserted.length === 1 && inserted.sliceString(0) === "/") typedSlash = true;
      });
      if (!typedSlash) return;
      const view = update.view;
      const pos = view.state.selection.main.head;
      const line = view.state.doc.lineAt(pos);
      if (/^\s*\/$/.test(view.state.sliceDoc(line.from, pos))) {
        // Defer: can't dispatch during an update.
        Promise.resolve().then(() => startCompletion(view));
      }
    }),

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
            const mode = cm.state.vim?.mode || "normal";
            const keyBuffer = cm.state.vim?.inputState?.keyBuffer || "";
            onVimModeChange({ mode, keyBuffer });
          }
        } catch (e) {
          // Vim not initialized yet
        }
      }
    }),
  ];

  // Optional features
  // Line numbers, fold arrows and the active-line highlight are the "code IDE"
  // chrome — grouped so the clean Notion look (default) omits them together.
  if (enableLineNumbers) {
    extensions.push(
      lineNumbers(),
      highlightActiveLineGutter(),
      foldGutter(),
      highlightActiveLine()
    );
  }

  // Live Preview — Obsidian-style inline rendering. Decoration layer only, so
  // it composes with vim, RTL, autocomplete etc. Pushed before keymaps.
  if (enableLivePreview) {
    extensions.push(livePreview());
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

  // Vim mode. The visual-line mapping lives in Vim's shared keymap rather than
  // in this extension list, so it is (un)applied alongside the extension.
  setVimVisualLineMotion(enableVimMode && vimVisualLineMotion);
  if (enableVimMode) {
    extensions.push(vim());
    // Only Live Preview rewrites a motion's landing place, so only it can leave
    // vim's visual selection stale.
    if (enableLivePreview) extensions.push(vimBlockStepSync);
  }

  // Typewriter mode
  if (enableTypewriterMode) {
    extensions.push(...typewriterMode());
  }

  // Keymaps (order matters - later overrides earlier)
  extensions.push(
    Prec.high(keymap.of(buildMarkyKeymaps(editorSearchKeymap, formattingKeymaps))), // Custom keymaps highest priority
    keymap.of(closeBracketsKeymap),
    keymap.of(foldKeymap),
    keymap.of(historyKeymap),
    keymap.of(defaultKeymap),
    keymap.of([indentWithTab])
  );

  if (enableSearch) {
    extensions.push(keymap.of(filteredSearchKeymap));
  }

  return extensions;
}
