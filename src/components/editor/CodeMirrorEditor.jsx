import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { createExtensions } from './extensions';

const CodeMirrorEditor = forwardRef(({
  value,
  onChange,
  onVimModeChange,
  placeholder = '',
  readOnly = false,
  className = '',
  enableLineNumbers = true,
  enableVimMode = false,
  getNotes = () => [],
  getTags = () => [],
}, ref) => {
  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const updateListenerRef = useRef(null);
  const vimModeChangeListenerRef = useRef(null);
  const getNotesRef = useRef(null);
  const getTagsRef = useRef(null);
  const suppressOnChangeRef = useRef(false);
  const vimStatusSyncFrameRef = useRef(null);

  // Store onChange, onVimModeChange, and getNotes in refs to avoid recreating extensions
  useEffect(() => {
    updateListenerRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    vimModeChangeListenerRef.current = onVimModeChange;
  }, [onVimModeChange]);

  useEffect(() => {
    getNotesRef.current = getNotes;
  }, [getNotes]);

  useEffect(() => {
    getTagsRef.current = getTags;
  }, [getTags]);

  const emitVimModeStatus = () => {
    if (!enableVimMode || !viewRef.current || !vimModeChangeListenerRef.current) return;

    try {
      const cm = getCM(viewRef.current);
      if (!cm) return;
      const mode = cm.state.vim?.mode || 'normal';
      const keyBuffer = cm.state.vim?.inputState?.keyBuffer || '';
      vimModeChangeListenerRef.current({ mode, keyBuffer });
    } catch {
      // Vim not initialized yet
    }
  };

  const scheduleVimModeStatusSync = () => {
    if (!enableVimMode) return;
    if (vimStatusSyncFrameRef.current !== null) {
      cancelAnimationFrame(vimStatusSyncFrameRef.current);
    }
    vimStatusSyncFrameRef.current = requestAnimationFrame(() => {
      vimStatusSyncFrameRef.current = null;
      emitVimModeStatus();
    });
  };

  // Initialize CodeMirror
  useEffect(() => {
    if (!editorRef.current) return;

    const extensions = createExtensions({
      readOnly,
      placeholderText: placeholder,
      onUpdate: (newValue) => {
        if (!suppressOnChangeRef.current && updateListenerRef.current) {
          updateListenerRef.current(newValue);
        }
      },
      onVimModeChange: (vimStatus) => {
        if (vimModeChangeListenerRef.current) {
          vimModeChangeListenerRef.current(vimStatus);
        }
      },
      enableLineNumbers,
      enableVimMode,
      getNotes: () => (getNotesRef.current ? getNotesRef.current() : []),
      getTags: () => (getTagsRef.current ? getTagsRef.current() : []),
    });

    const state = EditorState.create({
      doc: value || '',
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    // Initial mode sync after Vim extension initializes
    scheduleVimModeStatusSync();

    return () => {
      if (vimStatusSyncFrameRef.current !== null) {
        cancelAnimationFrame(vimStatusSyncFrameRef.current);
        vimStatusSyncFrameRef.current = null;
      }
      view.destroy();
      viewRef.current = null;
    };
  }, [readOnly, placeholder, enableLineNumbers, enableVimMode]);

  // Some Vim mode transitions (notably Insert -> Normal via Esc) may not dispatch
  // a document-changing transaction immediately, so sync status on editor key events too.
  useEffect(() => {
    if (!enableVimMode || !editorRef.current) return;

    const root = editorRef.current;
    const handleKeyEvent = () => {
      scheduleVimModeStatusSync();
      setTimeout(() => {
        emitVimModeStatus();
      }, 0);
    };

    root.addEventListener('keydown', handleKeyEvent, true);
    root.addEventListener('keyup', handleKeyEvent, true);
    root.addEventListener('mouseup', handleKeyEvent, true);
    root.addEventListener('focusin', handleKeyEvent, true);

    return () => {
      root.removeEventListener('keydown', handleKeyEvent, true);
      root.removeEventListener('keyup', handleKeyEvent, true);
      root.removeEventListener('mouseup', handleKeyEvent, true);
      root.removeEventListener('focusin', handleKeyEvent, true);
    };
  }, [enableVimMode]);

  // Update document when value changes externally (e.g., switching notes)
  useEffect(() => {
    if (!viewRef.current) return;

    const currentValue = viewRef.current.state.doc.toString();
    if (value !== currentValue) {
      // Suppress onChange to avoid marking note dirty when loading content
      suppressOnChangeRef.current = true;
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value || '',
        },
      });
      suppressOnChangeRef.current = false;
      scheduleVimModeStatusSync();
    }
  }, [value]);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    getView: () => viewRef.current,

    focus: () => {
      if (viewRef.current) {
        viewRef.current.focus();
      }
    },

    getSelection: () => {
      if (!viewRef.current) return { from: 0, to: 0 };
      const { from, to } = viewRef.current.state.selection.main;
      return { from, to };
    },

    setSelection: (from, to) => {
      if (!viewRef.current) return;
      viewRef.current.dispatch({
        selection: { anchor: from, head: to },
        scrollIntoView: true,
      });
      viewRef.current.focus();
    },

    insertText: (text, from = null, to = null) => {
      if (!viewRef.current) return;

      const selection = viewRef.current.state.selection.main;
      const insertFrom = from !== null ? from : selection.from;
      const insertTo = to !== null ? to : selection.to;

      viewRef.current.dispatch({
        changes: { from: insertFrom, to: insertTo, insert: text },
        selection: { anchor: insertFrom + text.length },
        scrollIntoView: true,
      });
      viewRef.current.focus();
    },

    replaceSelection: (text) => {
      if (!viewRef.current) return;
      const { from, to } = viewRef.current.state.selection.main;
      viewRef.current.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
        scrollIntoView: true,
      });
      viewRef.current.focus();
    },

    getSelectedText: () => {
      if (!viewRef.current) return '';
      const { from, to } = viewRef.current.state.selection.main;
      return viewRef.current.state.sliceDoc(from, to);
    },

    scrollToPosition: (pos) => {
      if (!viewRef.current) return;
      viewRef.current.dispatch({
        selection: { anchor: pos },
        scrollIntoView: true,
      });
      viewRef.current.focus();
    },
  }), []);

  return (
    <div
      ref={editorRef}
      className={`codemirror-wrapper editor-textarea ${className}`}
      style={{ height: '100%', overflow: 'auto' }}
    />
  );
});

CodeMirrorEditor.displayName = 'CodeMirrorEditor';

export default CodeMirrorEditor;
