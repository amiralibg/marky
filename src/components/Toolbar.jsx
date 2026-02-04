import { useState, useEffect } from 'react';

// ─── SVG Icons ───────────────────────────────────────────────────────────────

const ICONS = {
  // Tab icons
  text: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" />
    </svg>
  ),
  structure: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M3 12h14" /><path d="M3 18h10" />
    </svg>
  ),
  insert: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" /><path d="M5 12h14" />
    </svg>
  ),

  // Text buttons
  bold: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" /><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
    </svg>
  ),
  italic: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" />
    </svg>
  ),
  strikethrough: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4H9a3 3 0 0 0-3 3c0 2 1.5 3 3 3" /><path d="M12 12h4c1.5 0 3 1 3 3a3 3 0 0 1-3 3H8" /><line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  ),
  inlineCode: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  link: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  image: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
    </svg>
  ),

  // Structure buttons
  h1: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <text x="2" y="17" fontSize="14" fontWeight="700" fontFamily="system-ui">H</text>
      <text x="14" y="19" fontSize="10" fontWeight="600" fontFamily="system-ui">1</text>
    </svg>
  ),
  h2: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <text x="2" y="17" fontSize="14" fontWeight="700" fontFamily="system-ui">H</text>
      <text x="14" y="19" fontSize="10" fontWeight="600" fontFamily="system-ui">2</text>
    </svg>
  ),
  h3: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <text x="2" y="17" fontSize="14" fontWeight="700" fontFamily="system-ui">H</text>
      <text x="14" y="19" fontSize="10" fontWeight="600" fontFamily="system-ui">3</text>
    </svg>
  ),
  quote: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="3" y2="18" /><path d="M8 6h13" /><path d="M8 12h9" /><path d="M8 18h5" />
    </svg>
  ),
  bulletList: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="5" cy="6" r="1" fill="currentColor" /><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="5" cy="18" r="1" fill="currentColor" />
    </svg>
  ),
  numberedList: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <text x="2" y="8" fontSize="7" fontWeight="600" fontFamily="system-ui">1.</text>
      <text x="2" y="14.5" fontSize="7" fontWeight="600" fontFamily="system-ui">2.</text>
      <text x="2" y="21" fontSize="7" fontWeight="600" fontFamily="system-ui">3.</text>
      <rect x="11" y="5" width="10" height="1.5" rx="0.5" /><rect x="11" y="11.5" width="10" height="1.5" rx="0.5" /><rect x="11" y="18" width="10" height="1.5" rx="0.5" />
    </svg>
  ),
  taskList: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="6" height="6" rx="1" /><path d="M5 8l1.5 1.5L9 7" /><line x1="13" y1="8" x2="21" y2="8" />
      <rect x="3" y="14" width="6" height="6" rx="1" /><line x1="13" y1="17" x2="21" y2="17" />
    </svg>
  ),
  horizontalRule: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <circle cx="7" cy="12" r="0.5" fill="currentColor" /><circle cx="12" cy="12" r="0.5" fill="currentColor" /><circle cx="17" cy="12" r="0.5" fill="currentColor" />
    </svg>
  ),

  // Insert buttons
  table: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  ),
  codeBlock: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
      <path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1" />
    </svg>
  ),
  footnote: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <text x="3" y="16" fontSize="13" fontWeight="600" fontFamily="system-ui">T</text>
      <text x="14" y="10" fontSize="9" fontWeight="700" fontFamily="system-ui">1</text>
    </svg>
  ),
  mathInline: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20L8 4" /><path d="M4 12h8" /><path d="M16 8l4 4-4 4" />
    </svg>
  ),
  mathBlock: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M7 15l2-6" /><path d="M7 12h4" /><path d="M15 10l2 2-2 2" />
    </svg>
  ),
  mermaid: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="5" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="8.5" y="16" width="7" height="5" rx="1" />
      <path d="M6.5 8v3a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V8" /><path d="M12 13v3" />
    </svg>
  ),
};

// ─── Tab & Button Definitions ────────────────────────────────────────────────

const TABS = [
  { id: 'text', label: 'Text', icon: ICONS.text },
  { id: 'structure', label: 'Structure', icon: ICONS.structure },
  { id: 'insert', label: 'Insert', icon: ICONS.insert },
];

const TABLE_TEMPLATE = '\n| Header 1 | Header 2 | Header 3 |\n| -------- | -------- | -------- |\n| Cell 1   | Cell 2   | Cell 3   |\n';

const TAB_BUTTONS = {
  text: [
    { id: 'bold', label: 'Bold', icon: ICONS.bold, before: '**', after: '**', placeholder: 'bold text', tooltip: 'Bold (**text**)', shortcut: 'Ctrl+B' },
    { id: 'italic', label: 'Italic', icon: ICONS.italic, before: '*', after: '*', placeholder: 'italic text', tooltip: 'Italic (*text*)', shortcut: 'Ctrl+I' },
    { id: 'strikethrough', label: 'Strike', icon: ICONS.strikethrough, before: '~~', after: '~~', placeholder: 'text', tooltip: 'Strikethrough (~~text~~)' },
    { id: 'inlineCode', label: 'Code', icon: ICONS.inlineCode, before: '`', after: '`', placeholder: 'code', tooltip: 'Inline code (`code`)' },
    { id: 'link', label: 'Link', icon: ICONS.link, before: '[', after: '](https://)', placeholder: 'link text', tooltip: 'Link ([text](url))', shortcut: 'Ctrl+K' },
    { id: 'image', label: 'Image', icon: ICONS.image, before: '![', after: '](url)', placeholder: 'alt text', tooltip: 'Image (![alt](url))' },
  ],
  structure: [
    { id: 'h1', label: 'H1', icon: ICONS.h1, before: '# ', after: '', placeholder: 'Heading', tooltip: 'Heading 1 (#)' },
    { id: 'h2', label: 'H2', icon: ICONS.h2, before: '## ', after: '', placeholder: 'Heading', tooltip: 'Heading 2 (##)' },
    { id: 'h3', label: 'H3', icon: ICONS.h3, before: '### ', after: '', placeholder: 'Heading', tooltip: 'Heading 3 (###)' },
    { id: 'quote', label: 'Quote', icon: ICONS.quote, before: '> ', after: '', placeholder: 'Quote', tooltip: 'Blockquote (>)' },
    { id: 'bulletList', label: 'Bullets', icon: ICONS.bulletList, before: '- ', after: '', placeholder: 'item', tooltip: 'Bullet list (- )', shortcut: 'Ctrl+Shift+L' },
    { id: 'numberedList', label: 'Numbers', icon: ICONS.numberedList, before: '1. ', after: '', placeholder: 'item', tooltip: 'Numbered list (1.)' },
    { id: 'taskList', label: 'Tasks', icon: ICONS.taskList, before: '- [ ] ', after: '', placeholder: 'task', tooltip: 'Task list (- [ ])' },
    { id: 'hr', label: 'Line', icon: ICONS.horizontalRule, before: '\n---\n', after: '', placeholder: '', tooltip: 'Horizontal rule (---)' },
  ],
  insert: [
    { id: 'table', label: 'Table', icon: ICONS.table, before: TABLE_TEMPLATE, after: '', placeholder: '', tooltip: 'Insert table (3x3)' },
    { id: 'codeBlock', label: 'Code Block', icon: ICONS.codeBlock, before: '```\n', after: '\n```', placeholder: 'code', tooltip: 'Code block (```)', shortcut: 'Ctrl+Shift+C' },
    { id: 'footnote', label: 'Footnote', icon: ICONS.footnote, before: '[^', after: ']', placeholder: '1', tooltip: 'Footnote — add [^1]: text at bottom' },
    { id: 'mathInline', label: 'Math', icon: ICONS.mathInline, before: '$', after: '$', placeholder: 'E=mc^2', tooltip: 'Inline math ($...$)' },
    { id: 'mathBlock', label: 'Math Block', icon: ICONS.mathBlock, before: '\n$$\n', after: '\n$$', placeholder: 'E=mc^2', tooltip: 'Display math ($$...$$)' },
    { id: 'mermaid', label: 'Diagram', icon: ICONS.mermaid, before: '```mermaid\n', after: '\n```', placeholder: 'graph TD;\n    A-->B;', tooltip: 'Mermaid diagram' },
  ],
};

// ─── Component ───────────────────────────────────────────────────────────────

const Toolbar = ({ onInsert }) => {
  const [activeTab, setActiveTab] = useState('text');

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMod = e.metaKey || e.ctrlKey;

      if (!isMod) return;

      const textarea = document.querySelector('.editor-textarea');
      if (!textarea || document.activeElement !== textarea) return;

      if (e.key === 'b') {
        e.preventDefault();
        onInsert('**', '**', 'bold text');
      } else if (e.key === 'i') {
        e.preventDefault();
        onInsert('*', '*', 'italic text');
      } else if (e.key === 'k') {
        e.preventDefault();
        onInsert('[', '](https://)', 'link text');
      } else if (e.shiftKey && e.key === 'C') {
        e.preventDefault();
        onInsert('```\n', '\n```', 'code');
      } else if (e.shiftKey && e.key === 'L') {
        e.preventDefault();
        onInsert('- ', '', 'item');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onInsert]);

  const buttons = TAB_BUTTONS[activeTab];
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

  const getTooltip = (btn) => {
    let tip = btn.tooltip;
    if (btn.shortcut) {
      const shortcut = isMac ? btn.shortcut.replace('Ctrl', '⌘') : btn.shortcut;
      tip += ` — ${shortcut}`;
    }
    return tip;
  };

  return (
    <div className="px-4 py-2">
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full
              transition-colors duration-150
              ${activeTab === tab.id
                ? 'bg-accent/15 text-accent'
                : 'text-text-muted hover:text-text-secondary hover:bg-overlay-subtle'
              }
            `}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Buttons */}
      <div className="flex flex-wrap gap-1">
        {buttons.map((btn) => (
          <button
            key={btn.id}
            className="px-2.5 py-1.5 text-xs font-medium text-text-secondary
                     bg-border hover:bg-border/80 rounded
                     transition-colors duration-150 flex items-center gap-1.5
                     border border-border-light"
            onClick={() => onInsert(btn.before, btn.after, btn.placeholder)}
            title={getTooltip(btn)}
          >
            {btn.icon}
            <span className="hidden sm:inline">{btn.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default Toolbar;
