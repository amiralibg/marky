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

// Simple force-directed layout simulation
const forceLayout = (notes, width, height, iterations = 200) => {
  const count = notes.length;
  if (count === 0) return { nodes: [], edges: [] };

  // Initialize positions in a circle (better starting point for force layout)
  const cx = width / 2;
  const cy = height / 2;
  const initRadius = Math.min(width, height) * 0.3;

  const nodes = notes.map((note, i) => {
    const angle = (2 * Math.PI * i) / count;
    return {
      ...note,
      x: cx + initRadius * Math.cos(angle) + (Math.random() - 0.5) * 20,
      y: cy + initRadius * Math.sin(angle) + (Math.random() - 0.5) * 20,
      vx: 0,
      vy: 0,
    };
  });

  // Build edges
  const nodesByKey = new Map(nodes.map((node) => [node.linkKey, node]));
  const edges = [];
  const connectedPairs = new Set();

  nodes.forEach((node) => {
    node.links.forEach((link) => {
      const target = nodesByKey.get(link.key);
      if (target && target.id !== node.id) {
        const pairKey = [node.id, target.id].sort().join('-');
        if (!connectedPairs.has(pairKey)) {
          connectedPairs.add(pairKey);
          edges.push({ source: node, target });
        }
      }
    });
  });

  // Build adjacency for connected checks
  const connected = new Set();
  edges.forEach(e => {
    connected.add(`${e.source.id}-${e.target.id}`);
    connected.add(`${e.target.id}-${e.source.id}`);
  });

  // Force simulation parameters
  const repulsion = 3000;
  const attraction = 0.005;
  const idealLength = 120;
  const centerGravity = 0.01;
  const damping = 0.9;
  const minDist = 30;

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations; // cooling

    // Repulsion between all pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dist = 1; }

        const force = (repulsion * alpha) / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // Attraction along edges (spring force)
    edges.forEach(({ source, target }) => {
      let dx = target.x - source.x;
      let dy = target.y - source.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) dist = 1;

      const displacement = dist - idealLength;
      const force = attraction * displacement * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    });

    // Center gravity
    nodes.forEach((node) => {
      node.vx += (cx - node.x) * centerGravity * alpha;
      node.vy += (cy - node.y) * centerGravity * alpha;
    });

    // Apply velocities with damping
    nodes.forEach((node) => {
      node.vx *= damping;
      node.vy *= damping;
      node.x += node.vx;
      node.y += node.vy;

      // Keep within bounds with padding
      const pad = 60;
      node.x = Math.max(pad, Math.min(width - pad, node.x));
      node.y = Math.max(pad, Math.min(height - pad, node.y));
    });

    // Minimum distance enforcement
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          if (dist < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dist = 1; }
          const overlap = (minDist - dist) / 2;
          const ox = (dx / dist) * overlap;
          const oy = (dy / dist) * overlap;
          a.x -= ox;
          a.y -= oy;
          b.x += ox;
          b.y += oy;
        }
      }
    }
  }

  // Clean up temp properties
  nodes.forEach(n => { delete n.vx; delete n.vy; });

  return { nodes, edges };
};

const GraphModal = ({ isOpen, onClose }) => {
  const items = useNotesStore((state) => state.items);
  const selectNote = useNotesStore((state) => state.selectNote);
  const currentNoteId = useNotesStore((state) => state.currentNoteId);

  const [hoveredNode, setHoveredNode] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all', 'connected', 'orphaned'

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

  // Filter notes
  const filteredNotes = useMemo(() => {
    if (filter === 'all') return withBacklinks;

    // Determine which notes have any connections
    const connectedKeys = new Set();
    withBacklinks.forEach(note => {
      if (note.links.length > 0 || note.backlinkCount > 0) {
        connectedKeys.add(note.linkKey);
        note.links.forEach(link => connectedKeys.add(link.key));
      }
    });

    if (filter === 'connected') {
      return withBacklinks.filter(note => connectedKeys.has(note.linkKey));
    }
    if (filter === 'orphaned') {
      return withBacklinks.filter(note => !connectedKeys.has(note.linkKey));
    }
    return withBacklinks;
  }, [withBacklinks, filter]);

  const viewSize = 600;
  const { nodes, edges } = useMemo(
    () => forceLayout(filteredNotes, viewSize, viewSize),
    [filteredNotes]
  );

  // Stats
  const stats = useMemo(() => ({
    totalNotes: withBacklinks.length,
    totalEdges: edges.length,
    orphaned: withBacklinks.filter(n => n.links.length === 0 && n.backlinkCount === 0).length,
  }), [withBacklinks, edges]);

  // Connected edges for hover highlighting
  const hoveredEdges = useMemo(() => {
    if (!hoveredNode) return new Set();
    const s = new Set();
    edges.forEach((e, i) => {
      if (e.source.id === hoveredNode || e.target.id === hoveredNode) {
        s.add(i);
      }
    });
    return s;
  }, [hoveredNode, edges]);

  const hoveredNeighbors = useMemo(() => {
    if (!hoveredNode) return new Set();
    const s = new Set([hoveredNode]);
    edges.forEach(e => {
      if (e.source.id === hoveredNode) s.add(e.target.id);
      if (e.target.id === hoveredNode) s.add(e.source.id);
    });
    return s;
  }, [hoveredNode, edges]);

  // Zoom and Pan State
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const svgRef = useRef(null);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const zoomSpeed = 0.001;
    const minZoom = 0.3;
    const maxZoom = 4;

    setTransform(prev => {
      const newK = Math.max(minZoom, Math.min(maxZoom, prev.k - e.deltaY * zoomSpeed));
      return { ...prev, k: newK };
    });
  }, []);

  const startDragging = useCallback((e) => {
    if (e.button !== 0) return;
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
      const newK = Math.max(0.3, Math.min(4, prev.k + delta));
      return { ...prev, k: newK };
    });
  };

  const handleReset = () => {
    setTransform({ x: 0, y: 0, k: 1 });
  };

  // Fit graph to view
  const handleFit = useCallback(() => {
    if (nodes.length === 0) return;
    const padding = 80;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    });
    const graphW = maxX - minX + padding * 2;
    const graphH = maxY - minY + padding * 2;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / graphW, rect.height / graphH, 2);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setTransform({
      x: rect.width / 2 - cx * scale,
      y: rect.height / 2 - cy * scale,
      k: scale,
    });
  }, [nodes]);

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

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setTransform({ x: 0, y: 0, k: 1 });
      setHoveredNode(null);
      setFilter('all');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getNodeColor = (node) => {
    const isActive = node.id === currentNoteId;
    const isHovered = hoveredNode === node.id;
    const isNeighbor = hoveredNode && hoveredNeighbors.has(node.id);
    const isDimmed = hoveredNode && !hoveredNeighbors.has(node.id);

    if (isActive) return { fill: 'var(--color-accent)', stroke: 'var(--color-accent)', opacity: 1, strokeWidth: 3 };
    if (isHovered) return { fill: 'var(--color-accent)', stroke: 'var(--color-accent)', opacity: 1, strokeWidth: 2.5 };
    if (isNeighbor) return { fill: 'color-mix(in srgb, var(--color-accent) 60%, transparent)', stroke: 'var(--color-accent)', opacity: 1, strokeWidth: 2 };
    if (isDimmed) return { fill: 'rgb(51 65 85 / 0.4)', stroke: 'rgba(148, 163, 184, 0.15)', opacity: 0.3, strokeWidth: 1 };

    // Size-based coloring: more backlinks = brighter
    const intensity = Math.min(1, 0.4 + node.backlinkCount * 0.15);
    return {
      fill: `color-mix(in srgb, var(--color-accent) ${Math.round(intensity * 60)}%, rgb(51 65 85 / 0.8))`,
      stroke: `rgba(148, 163, 184, ${0.2 + intensity * 0.3})`,
      opacity: 1,
      strokeWidth: 1.5
    };
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fadeIn" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="glass-panel border-glass-border rounded-xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col pointer-events-auto animate-slideUp overflow-hidden"
          onClick={(event) => event.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-glass-border px-6 py-4 shrink-0 bg-bg-base/40 backdrop-blur-md">
            <div>
              <h2 className="text-xl font-semibold text-text-primary">Note Graph</h2>
              <p className="text-sm text-text-muted mt-1">
                {stats.totalNotes} notes &middot; {stats.totalEdges} connections &middot; {stats.orphaned} orphaned
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Filter buttons */}
              <div className="flex items-center bg-overlay-subtle rounded-lg p-1 border border-overlay-light">
                {[
                  { value: 'all', label: 'All' },
                  { value: 'connected', label: 'Connected' },
                  { value: 'orphaned', label: 'Orphaned' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFilter(opt.value)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                      filter === opt.value
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-text-secondary hover:text-text-primary hover:bg-overlay-light'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Zoom controls */}
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
                  onClick={handleFit}
                  className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider hover:bg-overlay-light rounded-md text-text-secondary hover:text-text-primary transition-all"
                  title="Fit to view"
                >
                  Fit
                </button>
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

          {/* Graph Area */}
          <div className="flex-1 relative bg-bg-editor/40 overflow-hidden">
            {nodes.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-muted">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <p className="text-base">
                    {filter === 'orphaned' ? 'No orphaned notes found.' :
                     filter === 'connected' ? 'No connected notes found.' :
                     'No notes yet. Use [[WikiLinks]] to connect your notes.'}
                  </p>
                </div>
              </div>
            ) : (
              <svg
                ref={svgRef}
                className={`w-full h-full select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                onMouseDown={startDragging}
                onMouseMove={handleDrag}
                onMouseUp={stopDragging}
                onMouseLeave={() => { stopDragging(); setHoveredNode(null); }}
              >
                <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
                  {/* Edges */}
                  {edges.map((edge, index) => {
                    const isHighlighted = hoveredEdges.has(index);
                    const isDimmed = hoveredNode && !isHighlighted;
                    return (
                      <line
                        key={index}
                        x1={edge.source.x}
                        y1={edge.source.y}
                        x2={edge.target.x}
                        y2={edge.target.y}
                        stroke={isHighlighted ? 'var(--color-accent)' : 'rgba(148, 163, 184, 0.2)'}
                        strokeWidth={isHighlighted ? 2 : 1}
                        opacity={isDimmed ? 0.08 : isHighlighted ? 0.8 : 0.4}
                        className="transition-all duration-150"
                      />
                    );
                  })}

                  {/* Nodes */}
                  {nodes.map((node) => {
                    const isActive = node.id === currentNoteId;
                    const radius = Math.max(6, 8 + Math.min(node.backlinkCount, 6) * 2);
                    const label = node.name.length > 20 ? `${node.name.slice(0, 20)}...` : node.name;
                    const colors = getNodeColor(node);

                    return (
                      <g
                        key={node.id}
                        className="group"
                        onMouseEnter={() => setHoveredNode(node.id)}
                        onMouseLeave={() => setHoveredNode(null)}
                        style={{ cursor: 'pointer' }}
                      >
                        {/* Glow effect for hovered/active */}
                        {(hoveredNode === node.id || isActive) && (
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={radius + 6}
                            fill="none"
                            stroke="var(--color-accent)"
                            strokeWidth={1}
                            opacity={0.3}
                          />
                        )}
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={radius}
                          fill={colors.fill}
                          stroke={colors.stroke}
                          strokeWidth={colors.strokeWidth}
                          opacity={colors.opacity}
                          className="transition-all duration-150"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectNote(node.id);
                            onClose();
                          }}
                        />
                        {/* Label */}
                        <text
                          x={node.x}
                          y={node.y + radius + 14}
                          textAnchor="middle"
                          className="text-[10px] font-medium pointer-events-none transition-opacity duration-150"
                          fill={
                            isActive ? 'var(--color-accent)' :
                            hoveredNode === node.id ? 'var(--color-text-primary)' :
                            hoveredNode && !hoveredNeighbors.has(node.id) ? 'var(--color-text-muted)' :
                            'var(--color-text-secondary)'
                          }
                          opacity={hoveredNode && !hoveredNeighbors.has(node.id) ? 0.2 : 1}
                        >
                          {escapeTitle(label)}
                        </text>
                        {/* Backlink count badge */}
                        {node.backlinkCount > 0 && (
                          <text
                            x={node.x + radius + 4}
                            y={node.y - radius + 2}
                            className="text-[8px] font-bold pointer-events-none"
                            fill="var(--color-text-muted)"
                            opacity={hoveredNode && !hoveredNeighbors.has(node.id) ? 0.15 : 0.6}
                          >
                            {node.backlinkCount}
                          </text>
                        )}
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

            {/* Hover info tooltip */}
            {hoveredNode && (() => {
              const node = nodes.find(n => n.id === hoveredNode);
              if (!node) return null;
              return (
                <div className="absolute top-4 left-4 bg-bg-sidebar/95 backdrop-blur border border-border rounded-lg px-4 py-3 shadow-xl max-w-xs pointer-events-none">
                  <p className="text-sm font-semibold text-text-primary truncate">{node.name}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                    <span>{node.links.length} outgoing</span>
                    <span>&middot;</span>
                    <span>{node.backlinkCount} incoming</span>
                  </div>
                </div>
              );
            })()}

            {/* Legend */}
            <div className="absolute bottom-4 left-4 flex items-center gap-4 text-[10px] text-text-muted pointer-events-none">
              <span>Drag to pan</span>
              <span>&middot;</span>
              <span>Scroll to zoom</span>
              <span>&middot;</span>
              <span>Click nodes to navigate</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default GraphModal;
