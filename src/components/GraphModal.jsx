import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
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

  // Zoom and Pan State
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const svgRef = useRef(null);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const zoomSpeed = 0.001;
    const minZoom = 0.5;
    const maxZoom = 3;

    setTransform(prev => {
      const newK = Math.max(minZoom, Math.min(maxZoom, prev.k - e.deltaY * zoomSpeed));
      return { ...prev, k: newK };
    });
  }, []);

  const startDragging = useCallback((e) => {
    if (e.button !== 0) return; // Only left click
    setIsDragging(true);
    dragStart.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
  }, [transform.x, transform.y]);

  const handleDrag = useCallback((e) => {
    if (!isDragging) return;
    setTransform(prev => ({
      ...prev,
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    }));
  }, [isDragging]);

  const stopDragging = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleZoom = (delta) => {
    setTransform(prev => {
      const newK = Math.max(0.5, Math.min(3, prev.k + delta));
      return { ...prev, k: newK };
    });
  };

  const handleReset = () => {
    setTransform({ x: 0, y: 0, k: 1 });
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (svg) {
      svg.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (svg) {
        svg.removeEventListener('wheel', handleWheel);
      }
    };
  }, [handleWheel]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fadeIn" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="glass-panel border-glass-border rounded-xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col pointer-events-auto animate-slideUp overflow-hidden"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-glass-border px-6 py-4 shrink-0 bg-bg-base/40 backdrop-blur-md">
            <div>
              <h2 className="text-xl font-semibold text-text-primary">Note Graph</h2>
              <p className="text-sm text-text-muted mt-1">
                Drag to pan, scroll to zoom. Click nodes to navigate.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-overlay-subtle rounded-lg p-1 border border-overlay-light">
                <button
                  onClick={() => handleZoom(0.2)}
                  className="p-1.5 hover:bg-overlay-light rounded-md text-text-secondary hover:text-text-primary transition-all"
                  title="Zoom In"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button
                  onClick={() => handleZoom(-0.2)}
                  className="p-1.5 hover:bg-overlay-light rounded-md text-text-secondary hover:text-text-primary transition-all"
                  title="Zoom Out"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                <div className="w-px h-4 bg-white/10 mx-1" />
                <button
                  onClick={handleReset}
                  className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider hover:bg-overlay-light rounded-md text-text-secondary hover:text-text-primary transition-all"
                >
                  Reset
                </button>
              </div>

              <button
                onClick={onClose}
                className="p-2 hover:bg-overlay-light rounded-lg transition-colors border border-white/5"
                title="Close"
              >
                <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 relative bg-bg-editor/40 overflow-hidden">
            {nodes.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-muted">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <p className="text-base">No connections yet. Use [[WikiLinks]] to connect your notes.</p>
                </div>
              </div>
            ) : (
              <svg
                ref={svgRef}
                viewBox={`0 0 ${size} ${size}`}
                className={`w-full h-full cursor-all-scroll select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                onMouseDown={startDragging}
                onMouseMove={handleDrag}
                onMouseUp={stopDragging}
                onMouseLeave={stopDragging}
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
                    <path d="M0,0 L0,6 L6,3 z" fill="rgba(56, 189, 248, 0.4)" />
                  </marker>
                </defs>

                <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
                  {edges.map((edge, index) => (
                    <line
                      key={index}
                      x1={edge.source.x}
                      y1={edge.source.y}
                      x2={edge.target.x}
                      y2={edge.target.y}
                      stroke="rgba(148, 163, 184, 0.2)"
                      strokeWidth={1.5}
                      markerEnd="url(#arrowhead)"
                    />
                  ))}

                  {nodes.map((node) => {
                    const isActive = node.id === currentNoteId;
                    const radius = Math.max(8, 10 + Math.min(node.backlinkCount, 4));
                    const label = node.name.length > 24 ? `${node.name.slice(0, 24)}…` : node.name;
                    return (
                      <g key={node.id} className="group">
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={radius}
                          className="transition-all duration-150 cursor-pointer"
                          fill={isActive ? '#0ea5e9' : 'rgb(51 65 85 / 0.8)'}
                          stroke={isActive ? '#38bdf8' : 'rgba(148, 163, 184, 0.3)'}
                          strokeWidth={isActive ? 3 : 1.5}
                          onClick={(e) => {
                            e.stopPropagation();
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
                          className={`text-[10px] font-medium transition-colors ${isActive ? 'fill-sky-400' : 'fill-text-secondary group-hover:fill-text-primary'}`}
                          style={{ pointerEvents: 'none' }}
                        >
                          {escapeTitle(label)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            )}

            {/* Zoom Indicator */}
            <div className="absolute bottom-4 right-6 px-2 py-1 bg-black/20 dark:bg-black/40 backdrop-blur rounded text-[10px] text-text font-mono border border-white/5 pointer-events-none">
              {Math.round(transform.k * 100)}%
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default GraphModal;
