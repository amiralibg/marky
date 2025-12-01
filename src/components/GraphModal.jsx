import { useMemo } from 'react';
import useNotesStore from '../store/notesStore';

const escapeTitle = (value = '') => value.replace(/\s+/g, ' ').trim();
const linkTargetKey = (value = '') => value.replace(/\.(md|markdown|txt)$/i, '').trim().toLowerCase();

const extractWikiLinks = (content) => {
  if (!content) return [];
  const wikiLinkRegex = /\[\[([^\[\]]+)\]\]/g;
  const links = [];
  const seen = new Set();
  let match;

  while ((match = wikiLinkRegex.exec(content)) !== null) {
    const inner = match[1].trim();
    if (!inner) continue;

    const [targetRaw] = inner.split('|');
    const target = (targetRaw || '').trim();
    if (!target) continue;

    const normalized = linkTargetKey(target);
    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    links.push({ key: normalized, target });
  }

  return links;
};

const calcLayout = (notes) => {
  const count = notes.length;
  const size = 520;
  const center = size / 2;
  const radius = Math.min(center - 60, 120 + count * 14);

  if (count === 0) {
    return { size, nodes: [], edges: [] };
  }

  const nodes = notes.map((note, index) => {
    if (count === 1) {
      return {
        ...note,
        x: center,
        y: center
      };
    }

    const angle = (2 * Math.PI * index) / count;
    return {
      ...note,
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle)
    };
  });

  const nodesByKey = new Map(nodes.map((node) => [node.linkKey, node]));
  const edges = [];

  nodes.forEach((node) => {
    node.links.forEach((link) => {
      const target = nodesByKey.get(link.key);
      if (target && target.id !== node.id) {
        edges.push({ source: node, target });
      }
    });
  });

  return { size, nodes, edges };
};

const GraphModal = ({ isOpen, onClose }) => {
  const items = useNotesStore((state) => state.items);
  const selectNote = useNotesStore((state) => state.selectNote);
  const currentNoteId = useNotesStore((state) => state.currentNoteId);

  const notes = useMemo(() => {
    return items
      .filter((item) => item.type === 'note')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((note) => {
        const linkKey = note.linkKey || linkTargetKey(note.name);
        const rawLinks = Array.isArray(note.links) && note.links.length > 0
          ? note.links
          : extractWikiLinks(note.content);
        const links = rawLinks
          .map((link) => ({
            ...link,
            key: linkTargetKey(link.target || link.key || '')
          }))
          .filter((link) => Boolean(link.key));

        return {
          id: note.id,
          name: note.name,
          linkKey,
          links,
          backlinkCount: 0
        };
      });
  }, [items]);

  const withBacklinks = useMemo(() => {
    const backlinkCounts = new Map();
    notes.forEach((note) => {
      note.links.forEach((link) => {
        const current = backlinkCounts.get(link.key) || 0;
        backlinkCounts.set(link.key, current + 1);
      });
    });

    return notes.map((note) => ({
      ...note,
      backlinkCount: backlinkCounts.get(note.linkKey) || 0
    }));
  }, [notes]);

  const { size, nodes, edges } = useMemo(() => calcLayout(withBacklinks), [withBacklinks]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-sidebar-bg border border-white/10 rounded-xl shadow-2xl w-full max-w-4xl pointer-events-auto"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Note Graph</h2>
              <p className="text-sm text-text-muted mt-1">
                Click a node to open the linked note. Connections show wiki links between notes.
              </p>
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

          <div className="p-6">
            {nodes.length === 0 ? (
              <div className="py-16 text-center text-text-muted">
                <p className="text-base">No notes yet. Create a note with wiki links ([[Target Note]]) to see the graph.</p>
              </div>
            ) : (
              <svg
                viewBox={`0 0 ${size} ${size}`}
                className="w-full h-[520px] bg-editor-bg/60 rounded-lg border border-white/10"
              >
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="6"
                    markerHeight="6"
                    refX="8"
                    refY="3"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L0,6 L6,3 z" fill="rgba(148, 163, 184, 0.6)" />
                  </marker>
                </defs>

                {edges.map((edge, index) => (
                  <line
                    key={index}
                    x1={edge.source.x}
                    y1={edge.source.y}
                    x2={edge.target.x}
                    y2={edge.target.y}
                    stroke="rgba(148, 163, 184, 0.4)"
                    strokeWidth={1.5}
                    markerEnd="url(#arrowhead)"
                  />
                ))}

                {nodes.map((node) => {
                  const isActive = node.id === currentNoteId;
                  const radius = Math.max(8, 10 + Math.min(node.backlinkCount, 4));
                  const label = node.name.length > 24 ? `${node.name.slice(0, 24)}…` : node.name;
                  return (
                    <g key={node.id}>
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={radius}
                        className="transition-all duration-150 cursor-pointer"
                        fill={isActive ? '#38bdf8' : '#64748b'}
                        stroke={isActive ? '#bae6fd' : 'rgba(255,255,255,0.2)'}
                        strokeWidth={isActive ? 2.5 : 1.2}
                        onClick={() => {
                          selectNote(node.id);
                          onClose();
                        }}
                      >
                        <title>{`${node.name}${node.backlinkCount ? ` (← ${node.backlinkCount})` : ''}`}</title>
                      </circle>
                      <text
                        x={node.x}
                        y={node.y + radius + 16}
                        textAnchor="middle"
                        className="text-xs fill-white/80"
                      >
                        {escapeTitle(label)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default GraphModal;
