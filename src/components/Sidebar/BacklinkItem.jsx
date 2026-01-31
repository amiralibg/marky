import { useMemo } from 'react';

/**
 * Component for rendering a single backlink item
 * Shows the note that links to the current note with context preview
 */
const BacklinkItem = ({ backlink, onNavigate }) => {
  // Extract context around the link (first occurrence of the link)
  const context = useMemo(() => {
    if (!backlink.content) return null;

    // Try to find wiki link patterns that might reference the target
    const wikiLinkPattern = /\[\[([^\[\]]+)\]\]/g;
    let match;
    const matches = [];

    while ((match = wikiLinkPattern.exec(backlink.content)) !== null) {
      matches.push({
        index: match.index,
        text: match[0],
        inner: match[1]
      });
    }

    // Find a relevant match (we'll just use the first one for now)
    if (matches.length > 0) {
      const firstMatch = matches[0];
      const contextStart = Math.max(0, firstMatch.index - 40);
      const contextEnd = Math.min(backlink.content.length, firstMatch.index + firstMatch.text.length + 40);

      let preview = backlink.content.slice(contextStart, contextEnd).trim();

      // Add ellipsis if truncated
      if (contextStart > 0) preview = '...' + preview;
      if (contextEnd < backlink.content.length) preview = preview + '...';

      return preview;
    }

    // Fallback: just show the first ~80 characters
    const preview = backlink.content.slice(0, 80).trim();
    return preview.length < backlink.content.length ? preview + '...' : preview;
  }, [backlink.content]);

  return (
    <button
      onClick={() => onNavigate(backlink.id)}
      className="w-full px-3 py-2 text-left hover:bg-overlay-subtle rounded-md transition-colors group"
    >
      {/* Note name */}
      <div className="flex items-center gap-2 mb-1">
        <svg
          className="w-3 h-3 text-text-muted group-hover:text-accent transition-colors shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
        <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary truncate transition-colors">
          {backlink.name}
        </span>
      </div>

      {/* Context preview */}
      {context && (
        <div className="text-xs text-text-muted group-hover:text-text-secondary line-clamp-2 pl-5 transition-colors">
          {context}
        </div>
      )}
    </button>
  );
};

export default BacklinkItem;
