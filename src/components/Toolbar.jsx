const Toolbar = ({ onInsert }) => {
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
