import { useState } from 'react';
import useNotesStore from '../store/notesStore';

const TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank Note',
    icon: '📄',
    description: 'Start with an empty note',
    content: ''
  },
  {
    id: 'meeting',
    name: 'Meeting Notes',
    icon: '📋',
    description: 'Template for meeting notes',
    content: `# Meeting Notes

**Date:** ${new Date().toLocaleDateString()}
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
`
  },
  {
    id: 'todo',
    name: 'Todo List',
    icon: '✅',
    description: 'Task list template',
    content: `# Todo List

**Date:** ${new Date().toLocaleDateString()}

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
`
  },
  {
    id: 'daily',
    name: 'Daily Journal',
    icon: '📆',
    description: 'Daily journal entry',
    content: `# ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

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
`
  },
  {
    id: 'project',
    name: 'Project Plan',
    icon: '🎯',
    description: 'Project planning template',
    content: `# Project: [Project Name]

**Start Date:** ${new Date().toLocaleDateString()}
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
- 

---
#project
`
  },
  {
    id: 'research',
    name: 'Research Notes',
    icon: '🔍',
    description: 'Research and study notes',
    content: `# Research: [Topic]

**Date:** ${new Date().toLocaleDateString()}
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
`
  },
  {
    id: 'brainstorm',
    name: 'Brainstorming',
    icon: '💡',
    description: 'Ideas and brainstorming',
    content: `# Brainstorming: [Topic]

**Date:** ${new Date().toLocaleDateString()}

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
`
  }
];

const TemplateModal = ({ isOpen, onClose, onSelectTemplate }) => {
  const { customTemplates, addCustomTemplate, deleteCustomTemplate } = useNotesStore();
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    icon: '📝',
    description: '',
    content: ''
  });

  const allTemplates = [...TEMPLATES, ...customTemplates];

  if (!isOpen) return null;

  const handleSelect = () => {
    if (selectedTemplate) {
      onSelectTemplate(selectedTemplate);
      setSelectedTemplate(null);
      setShowCreateForm(false);
      onClose();
    }
  };

  const handleTemplateClick = (template) => {
    setSelectedTemplate(template);
    setShowCreateForm(false);
  };

  const handleCreateCustom = () => {
    if (newTemplate.name && newTemplate.content) {
      addCustomTemplate(newTemplate);
      setNewTemplate({ name: '', icon: '📝', description: '', content: '' });
      setShowCreateForm(false);
    }
  };

  const handleDeleteCustom = (e, templateId) => {
    e.stopPropagation();
    if (confirm('Delete this custom template?')) {
      deleteCustomTemplate(templateId);
      if (selectedTemplate?.id === templateId) {
        setSelectedTemplate(null);
      }
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fadeIn"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div 
          className="bg-sidebar-bg border border-white/10 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col pointer-events-auto animate-slideUp"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Choose a Template</h2>
              <p className="text-sm text-text-muted mt-1">Select a template to start your note</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Close"
            >
              <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Templates Grid */}
          <div className="flex-1 overflow-y-auto p-6">
            {showCreateForm ? (
              <div className="max-w-2xl mx-auto space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Template Name</label>
                  <input
                    type="text"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-text-muted focus:outline-none focus:border-accent"
                    placeholder="My Custom Template"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Icon (emoji)</label>
                  <input
                    type="text"
                    value={newTemplate.icon}
                    onChange={(e) => setNewTemplate({ ...newTemplate, icon: e.target.value })}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-text-muted focus:outline-none focus:border-accent"
                    placeholder="📝"
                    maxLength={2}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Description</label>
                  <input
                    type="text"
                    value={newTemplate.description}
                    onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-text-muted focus:outline-none focus:border-accent"
                    placeholder="Brief description of this template"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Template Content</label>
                  <textarea
                    value={newTemplate.content}
                    onChange={(e) => setNewTemplate({ ...newTemplate, content: e.target.value })}
                    className="w-full h-48 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-text-muted focus:outline-none focus:border-accent font-mono text-sm resize-none"
                    placeholder="# Template Title&#10;&#10;Your template content here..."
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewTemplate({ name: '', icon: '📝', description: '', content: '' });
                    }}
                    className="px-4 py-2 text-sm text-text-secondary hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateCustom}
                    disabled={!newTemplate.name || !newTemplate.content}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      newTemplate.name && newTemplate.content
                        ? 'bg-accent text-white hover:bg-accent/90'
                        : 'bg-white/10 text-text-muted cursor-not-allowed'
                    }`}
                  >
                    Save Template
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Templates</h3>
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="px-3 py-1.5 text-xs bg-accent text-white hover:bg-accent/90 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Custom
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {allTemplates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleTemplateClick(template)}
                      className={`p-4 rounded-lg border-2 text-left transition-all relative ${
                        selectedTemplate?.id === template.id
                          ? 'border-accent bg-accent/10'
                          : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-3xl">{template.icon}</span>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-white mb-1">{template.name}</h3>
                          <p className="text-xs text-text-muted">{template.description}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {template.isCustom && (
                            <button
                              onClick={(e) => handleDeleteCustom(e, template.id)}
                              className="p-1 hover:bg-red-500/20 rounded transition-colors"
                              title="Delete custom template"
                            >
                              <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                          {selectedTemplate?.id === template.id && (
                            <svg className="w-5 h-5 text-accent shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          {!showCreateForm && (
            <div className="border-t border-white/10 px-6 py-4 flex items-center justify-between">
              <div className="text-xs text-text-muted">
                {selectedTemplate ? (
                  <span>Selected: <span className="text-white font-medium">{selectedTemplate.name}</span></span>
                ) : (
                  <span>Select a template to continue</span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-text-secondary hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSelect}
                disabled={!selectedTemplate}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  selectedTemplate
                    ? 'bg-accent text-white hover:bg-accent/90'
                    : 'bg-white/10 text-text-muted cursor-not-allowed'
                }`}
              >
                Create Note
              </button>
            </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </>
  );
};

export default TemplateModal;
