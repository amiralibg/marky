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
}, ref) => {
  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const updateListenerRef = useRef(null);
  const vimModeChangeListenerRef = useRef(null);
  const getNotesRef = useRef(null);
  const suppressOnChangeRef = useRef(false);

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

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [readOnly, placeholder, enableLineNumbers, enableVimMode]);

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
