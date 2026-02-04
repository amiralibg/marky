import { useState, useEffect, useMemo } from 'react';
import { slugify } from '../utils/slugify';

/**
 * Parses markdown content to extract headers
 * @param {string} markdown - The markdown content
 * @returns {Array} Array of header objects with { level, text, id, line }
 */
const parseHeaders = (markdown) => {
  if (!markdown) return [];

  const lines = markdown.split('\n');
  const headers = [];
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber++;

    // Match ATX-style headers (# Header)
    const atxMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (atxMatch) {
      const level = atxMatch[1].length;
      const text = atxMatch[2].trim();
      headers.push({ level, text, id: slugify(text), line: lineNumber });
      continue;
    }

    // Match Setext-style headers (underlined with = or -)
    if (lineNumber > 1) {
      const prevLine = lines[lineNumber - 2];
      if (line.match(/^=+$/) && prevLine.trim()) {
        const text = prevLine.trim();
        headers.push({ level: 1, text, id: slugify(text), line: lineNumber - 1 });
      } else if (line.match(/^-+$/) && prevLine.trim()) {
        const text = prevLine.trim();
        headers.push({ level: 2, text, id: slugify(text), line: lineNumber - 1 });
      }
    }
  }

  return headers;
};

const TableOfContents = ({ markdown, onHeaderClick, className = '' }) => {
  const [activeId, setActiveId] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const headers = useMemo(() => parseHeaders(markdown), [markdown]);

  if (headers.length === 0) {
    return null;
  }

  const handleHeaderClick = (header) => {
    setActiveId(header.id);
    if (onHeaderClick) {
      onHeaderClick(header);
    }
  };

  const getIndentClass = (level) => {
    const indents = {
      1: 'pl-0',
      2: 'pl-3',
      3: 'pl-6',
      4: 'pl-9',
      5: 'pl-12',
      6: 'pl-15',
    };
    return indents[level] || 'pl-0';
  };

  const getFontSizeClass = (level) => {
    const sizes = {
      1: 'text-sm font-semibold',
      2: 'text-sm',
      3: 'text-xs',
      4: 'text-xs',
      5: 'text-xs',
      6: 'text-xs',
    };
    return sizes[level] || 'text-xs';
  };

  return (
    <div className={`bg-bg-sidebar border border-border rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-overlay-subtle">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          <h3 className="text-sm font-semibold text-text-primary">Table of Contents</h3>
          <span className="text-xs text-text-muted">({headers.length})</span>
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 hover:bg-overlay-light rounded transition-colors"
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          <svg
            className={`w-4 h-4 text-text-secondary transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* TOC List */}
      {!isCollapsed && (
        <div className="px-2 py-2 max-h-96 overflow-y-auto custom-scrollbar">
          {headers.map((header, index) => (
            <button
              key={`${header.id}-${index}`}
              onClick={() => handleHeaderClick(header)}
              className={`
                w-full text-left py-1.5 px-2 rounded transition-all
                ${getIndentClass(header.level)}
                ${getFontSizeClass(header.level)}
                ${
                  activeId === header.id
                    ? 'bg-accent/10 text-accent border-l-2 border-accent'
                    : 'text-text-secondary hover:text-text-primary hover:bg-overlay-subtle border-l-2 border-transparent'
                }
              `}
              title={header.text}
            >
              <span className="line-clamp-2 break-words">{header.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default TableOfContents;
