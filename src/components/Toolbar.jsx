import { useEffect } from 'react';

const Toolbar = ({ onInsert }) => {
  // Add keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMod = e.metaKey || e.ctrlKey;
      
      if (!isMod) return;
      
      const textarea = document.querySelector('.editor-textarea');
      if (!textarea || document.activeElement !== textarea) return;
      
      // Cmd/Ctrl + B - Bold
      if (e.key === 'b') {
        e.preventDefault();
        onInsert('**', '**', 'bold text');
      }
      // Cmd/Ctrl + I - Italic
      else if (e.key === 'i') {
        e.preventDefault();
        onInsert('*', '*', 'italic text');
      }
      // Cmd/Ctrl + K - Link
      else if (e.key === 'k') {
        e.preventDefault();
        onInsert('[', '](https://)', 'link text');
      }
      // Cmd/Ctrl + Shift + C - Code block
      else if (e.shiftKey && e.key === 'C') {
        e.preventDefault();
        onInsert('\n```\n', '\n```\n', 'code');
      }
      // Cmd/Ctrl + Shift + L - List
      else if (e.shiftKey && e.key === 'L') {
        e.preventDefault();
        onInsert('- ', '', 'item');
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onInsert]);

  const toolbarButtons = [
    {
      label: 'Bold',
      icon: 'B',
      action: () => onInsert('**', '**', 'bold text'),
      description: 'Make text bold (Ctrl+B)'
    },
    {
      label: 'Italic',
      icon: 'I',
      action: () => onInsert('*', '*', 'italic text'),
      description: 'Make text italic (Ctrl+I)'
    },
    {
      label: 'H1',
      icon: 'H1',
      action: () => onInsert('# ', '', 'Heading'),
      description: 'Heading 1'
    },
    {
      label: 'H2',
      icon: 'H2',
      action: () => onInsert('## ', '', 'Heading'),
      description: 'Heading 2'
    },
    {
      label: 'Link',
      icon: '🔗',
      action: () => onInsert('[', '](https://)', 'link text'),
      description: 'Insert link'
    },
    {
      label: 'Code',
      icon: '</>',
      action: () => onInsert('`', '`', 'code'),
      description: 'Inline code'
    },
    {
      label: 'Quote',
      icon: '❝',
      action: () => onInsert('> ', '', 'Quote'),
      description: 'Blockquote'
    },
    {
      label: 'List',
      icon: '•',
      action: () => onInsert('- ', '', 'item'),
      description: 'Bullet list'
    },
    {
      label: '1-2-3',
      icon: '1.',
      action: () => onInsert('1. ', '', 'item'),
      description: 'Numbered list'
    },
    {
      label: 'Code Block',
      icon: '{}',
      action: () => onInsert('```\n', '\n```', 'code'),
      description: 'Code block'
    }
  ];

  return (
    <div className="px-4 py-2">
      <div className="flex flex-wrap gap-1">
        {toolbarButtons.map((button, index) => (
          <button
            key={index}
            className="px-2.5 py-1.5 text-xs font-medium text-text-secondary
                     bg-border hover:bg-border/80 rounded
                     transition-colors duration-150 flex items-center gap-1.5
                     border border-border-light"
            onClick={button.action}
            title={button.description}
          >
            <span>{button.icon}</span>
            <span className="hidden sm:inline">{button.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default Toolbar;
