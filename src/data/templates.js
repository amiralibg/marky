const formatDate = (date) => date.toLocaleDateString();

const formatLongDate = (date) =>
  date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

const formatFileDate = (date) => date.toISOString().split('T')[0];

export const builtInTemplates = [
  {
    id: 'blank',
    name: 'Blank Note',
    icon: '📄',
    description: 'Start with an empty note',
    getContent: () => '',
    getSuggestedTitle: () => null
  },
  {
    id: 'meeting',
    name: 'Meeting Notes',
    icon: '📋',
    description: 'Template for meeting notes',
    getContent: () => {
      const today = formatDate(new Date());
      return `# Meeting Notes

**Date:** ${today}
**Attendees:** 
**Topic:** 

## Agenda
- 
- 
- 

## Discussion
[Add notes here]

## Action Items
- [ ] 
- [ ] 

## Next Steps
`;
    },
    getSuggestedTitle: () => `Meeting Notes ${formatFileDate(new Date())}`
  },
  {
    id: 'todo',
    name: 'Todo List',
    icon: '✅',
    description: 'Task list template',
    getContent: () => {
      const today = formatDate(new Date());
      return `# Todo List

**Date:** ${today}

## Today
- [ ] 
- [ ] 
- [ ] 

## This Week
- [ ] 
- [ ] 

## Backlog
- [ ] 
- [ ] 

---
#todo
`;
    },
    getSuggestedTitle: () => `Todo List ${formatFileDate(new Date())}`
  },
  {
    id: 'daily',
    name: 'Daily Journal',
    icon: '📆',
    description: 'Daily journal entry',
    getContent: () => {
      const now = new Date();
      return `# ${formatLongDate(now)}

## Morning Reflection
**Mood:** 
**Goals for today:**
- 
- 
- 

## Notes


## Evening Reflection
**What went well:**
- 

**What could be improved:**
- 

**Grateful for:**
- 

---
#journal
`;
    },
    getSuggestedTitle: () => formatFileDate(new Date())
  },
  {
    id: 'project',
    name: 'Project Plan',
    icon: '🎯',
    description: 'Project planning template',
    getContent: () => {
      const today = formatDate(new Date());
      return `# Project: [Project Name]

**Start Date:** ${today}
**Status:** Planning
**Owner:** 

## Overview
[Brief description]

## Objectives
- 
- 

## Timeline
- **Phase 1:** 
- **Phase 2:** 
- **Phase 3:** 

## Resources Needed
- 
- 

## Risks & Mitigation
- 

## Success Criteria
- 

---
#project
`;
    },
    getSuggestedTitle: () => `Project Plan ${formatFileDate(new Date())}`
  },
  {
    id: 'research',
    name: 'Research Notes',
    icon: '🔍',
    description: 'Research and study notes',
    getContent: () => {
      const today = formatDate(new Date());
      return `# Research: [Topic]

**Date:** ${today}
**Source:** 

## Key Questions
- 
- 

## Summary


## Findings
- **Finding 1:** 
- **Finding 2:** 

## References
1. 
2. 

## Next Steps
- [ ] 
- [ ] 

---
#research
`;
    },
    getSuggestedTitle: () => `Research ${formatFileDate(new Date())}`
  },
  {
    id: 'brainstorm',
    name: 'Brainstorming',
    icon: '💡',
    description: 'Ideas and brainstorming',
    getContent: () => {
      const today = formatDate(new Date());
      return `# Brainstorming: [Topic]

**Date:** ${today}

## Problem/Challenge


## Ideas
- 💡 
- 💡 
- 💡 

## Pros & Cons

### Option 1
**Pros:**
- 
**Cons:**
- 

### Option 2
**Pros:**
- 
**Cons:**
- 

## Decision
[To be determined]

---
#ideas
`;
    },
    getSuggestedTitle: () => `Brainstorm ${formatFileDate(new Date())}`
  }
];

export const getBuiltInTemplateById = (id) => builtInTemplates.find((template) => template.id === id) || null;

export const resolveTemplateContent = (template) => {
  if (!template) return '';
  if (template.type === 'builtin' && typeof template.getContent === 'function') {
    return template.getContent();
  }
  if (typeof template.getContent === 'function') {
    return template.getContent();
  }
  return template.content || '';
};

export const resolveTemplateTitle = (template) => {
  if (!template) return null;
  if (template.type === 'builtin' && typeof template.getSuggestedTitle === 'function') {
    return template.getSuggestedTitle();
  }
  if (typeof template.getSuggestedTitle === 'function') {
    return template.getSuggestedTitle();
  }
  return template.name || null;
};

export const resolveTemplateById = (templateId, customTemplates = []) => {
  if (!templateId) return null;

  const builtin = builtInTemplates.find((template) => template.id === templateId);
  if (builtin) {
    const enriched = {
      ...builtin,
      type: 'builtin'
    };
    return {
      ...enriched,
      content: resolveTemplateContent(enriched),
      suggestedTitle: resolveTemplateTitle(enriched)
    };
  }

  const custom = customTemplates.find((template) => template.id === templateId);
  if (!custom) return null;

  const enriched = {
    ...custom,
    type: 'custom'
  };

  return {
    ...enriched,
    content: resolveTemplateContent(enriched),
    suggestedTitle: resolveTemplateTitle(enriched)
  };
};
