import { autocompletion } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';

/**
 * Creates a wiki link autocomplete extension for CodeMirror
 * Triggers when typing [[ and shows available notes as completions
 *
 * @param {Function} getNotes - Function that returns array of notes with {id, name} properties
 * @returns {Extension} CodeMirror extension
 */
export function createWikiLinkAutocomplete(getNotes) {
  const wikiLinkCompletions = (context) => {
    const { state, pos } = context;
    const textBefore = state.sliceDoc(Math.max(0, pos - 100), pos);

    // Check if we're inside a wiki link by looking for [[
    const openBracketMatch = /\[\[([^\]]*)$/.exec(textBefore);

    if (!openBracketMatch) {
      return null;
    }

    // Get the partial text after [[
    const searchText = openBracketMatch[1];
    const from = pos - searchText.length;

    // Get all available notes
    const notes = getNotes();

    if (!notes || notes.length === 0) {
      return null;
    }

    // Filter and create completion options
    const options = notes
      .filter(note => {
        if (!searchText) return true;
        return note.name.toLowerCase().includes(searchText.toLowerCase());
      })
      .map(note => ({
        label: note.name,
        type: 'text',
        apply: (view, completion, from, to) => {
          // Check if we need to add closing brackets
          const textAfter = view.state.sliceDoc(to, to + 2);
          const needsClosing = !textAfter.startsWith(']]');

          const insertText = note.name + (needsClosing ? ']]' : '');

          view.dispatch({
            changes: { from, to, insert: insertText },
            selection: { anchor: from + insertText.length }
          });
        },
        detail: note.filePath ? '📄 Note' : '✨ New',
        info: note.filePath || 'Press Enter to insert',
      }))
      .slice(0, 20); // Limit to 20 results for performance

    if (options.length === 0) {
      return null;
    }

    return {
      from,
      options,
      validFor: /^[^\]]*$/
    };
  };

  return autocompletion({
    override: [wikiLinkCompletions],
    activateOnTyping: true,
    closeOnBlur: true,
    defaultKeymap: true,
    maxRenderedOptions: 20,
  });
}
