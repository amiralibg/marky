import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import useNotesStore from "../../store/notesStore";
import useUIStore from "../../store/uiStore";
import { buildGraphSvg, saveGraphPng, saveGraphSvg, nodeRadius } from "../../utils/graphExport";
import useModalAccessibility from "../../hooks/useModalAccessibility";
import { createSimulation, graphBounds } from "./graphSimulation";

const escapeTitle = (value = "") => value.replace(/\s+/g, " ").trim();
const linkTargetKey = (value = "") =>
  value
    .replace(/\.(md|markdown|txt)$/i, "")
    .trim()
    .toLowerCase();

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 5;
const LABEL_ZOOM_FLOOR = 0.45; // below this, labels are noise rather than information
const CLICK_SLOP = 4; // px of pointer travel still counted as a click, not a drag

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

const extractWikiLinks = (content) => {
  if (!content) return [];
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  const links = [];
  const seen = new Set();
  let match;

  while ((match = wikiLinkRegex.exec(content)) !== null) {
    const inner = match[1].trim();
    if (!inner) continue;

    const [targetRaw] = inner.split("|");
    const target = (targetRaw || "").trim();
    if (!target) continue;

    const normalized = linkTargetKey(target);
    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    links.push({ key: normalized, target });
  }

  return links;
};

const GraphModal = ({ isOpen, onClose }) => {
  const items = useNotesStore((state) => state.items);
  const selectNote = useNotesStore((state) => state.selectNote);
  const currentNoteId = useNotesStore((state) => state.currentNoteId);
  const addNotification = useUIStore((state) => state.addNotification);

  const [hoveredNode, setHoveredNode] = useState(null);
  const [filter, setFilter] = useState("all"); // 'all', 'connected', 'orphaned'
  const [exportingFormat, setExportingFormat] = useState(null);
  const [layoutSeed, setLayoutSeed] = useState(0);

  const notes = useMemo(() => {
    return items
      .filter((item) => item.type === "note")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((note) => {
        const linkKey = note.linkKey || linkTargetKey(note.name);
        const rawLinks =
          Array.isArray(note.links) && note.links.length > 0
            ? note.links
            : extractWikiLinks(note.content);
        const links = rawLinks
          .map((link) => ({
            ...link,
            key: linkTargetKey(link.target || link.key || ""),
          }))
          .filter((link) => Boolean(link.key));

        return {
          id: note.id,
          name: note.name,
          linkKey,
          links,
          backlinkCount: 0,
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
      backlinkCount: backlinkCounts.get(note.linkKey) || 0,
    }));
  }, [notes]);

  const filteredNotes = useMemo(() => {
    if (filter === "all") return withBacklinks;

    const connectedKeys = new Set();
    withBacklinks.forEach((note) => {
      if (note.links.length > 0 || note.backlinkCount > 0) {
        connectedKeys.add(note.linkKey);
        note.links.forEach((link) => connectedKeys.add(link.key));
      }
    });

    if (filter === "connected") {
      return withBacklinks.filter((note) => connectedKeys.has(note.linkKey));
    }
    if (filter === "orphaned") {
      return withBacklinks.filter((note) => !connectedKeys.has(note.linkKey));
    }
    return withBacklinks;
  }, [withBacklinks, filter]);

  // ── Canvas state ────────────────────────────────────────────────
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [, setFrame] = useState(0); // bumped per simulation tick to repaint
  const [isPanning, setIsPanning] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState(null);

  const containerRef = useRef(null);
  const dialogRef = useRef(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const [measured, setMeasured] = useState(false);

  const simRef = useRef(null);
  const alphaRef = useRef(0);
  const rafRef = useRef(null);
  const tweenRef = useRef(null);
  const didFitRef = useRef(false);
  const dragRef = useRef(null);
  const transformRef = useRef(transform);
  transformRef.current = transform;

  useModalAccessibility(isOpen, dialogRef);

  const { nodes, edges } = graph;

  const stats = useMemo(
    () => ({
      totalNotes: withBacklinks.length,
      totalEdges: edges.length,
      orphaned: withBacklinks.filter((n) => n.links.length === 0 && n.backlinkCount === 0).length,
    }),
    [withBacklinks, edges]
  );

  const hoveredEdges = useMemo(() => {
    if (!hoveredNode) return new Set();
    const s = new Set();
    edges.forEach((e, i) => {
      if (e.source.id === hoveredNode || e.target.id === hoveredNode) s.add(i);
    });
    return s;
  }, [hoveredNode, edges]);

  const hoveredNeighbors = useMemo(() => {
    if (!hoveredNode) return new Set();
    const s = new Set([hoveredNode]);
    edges.forEach((e) => {
      if (e.source.id === hoveredNode) s.add(e.target.id);
      if (e.target.id === hoveredNode) s.add(e.source.id);
    });
    return s;
  }, [hoveredNode, edges]);

  // ── Transform helpers ───────────────────────────────────────────

  /**
   * Marks the viewport as the user's. The settle-fit checks this, so a layout
   * that comes to rest mid-gesture cannot steal the view back.
   */
  const claimViewport = useCallback(() => {
    didFitRef.current = true;
  }, []);

  const cancelTween = useCallback(() => {
    if (tweenRef.current) {
      cancelAnimationFrame(tweenRef.current);
      tweenRef.current = null;
    }
  }, []);

  /** Ease the viewport to a target transform. Any direct input cancels it. */
  const animateTransform = useCallback(
    (target, duration = 320) => {
      cancelTween();
      const from = transformRef.current;
      const start = performance.now();

      const tick = (now) => {
        const t = clamp((now - start) / duration, 0, 1);
        const e = easeOutCubic(t);
        setTransform({
          x: from.x + (target.x - from.x) * e,
          y: from.y + (target.y - from.y) * e,
          k: from.k + (target.k - from.k) * e,
        });
        tweenRef.current = t < 1 ? requestAnimationFrame(tick) : null;
      };

      tweenRef.current = requestAnimationFrame(tick);
    },
    [cancelTween]
  );

  /**
   * Scale about a point in container space, so whatever is under the cursor
   * stays under the cursor. Zooming about the origin — which is what this did
   * before — throws the graph off screen the moment you are not centred.
   */
  const zoomAtPoint = useCallback((px, py, factor) => {
    setTransform((prev) => {
      const k = clamp(prev.k * factor, MIN_ZOOM, MAX_ZOOM);
      if (k === prev.k) return prev;
      return {
        k,
        x: px - ((px - prev.x) / prev.k) * k,
        y: py - ((py - prev.y) / prev.k) * k,
      };
    });
  }, []);

  const fitToView = useCallback(
    (animate = true) => {
      const sim = simRef.current;
      const { width, height } = sizeRef.current;
      if (!sim || sim.nodes.length === 0 || width === 0) return;

      const padding = 72;
      const { minX, minY, maxX, maxY } = graphBounds(sim.nodes, (n) => nodeRadius(n.backlinkCount));
      const graphW = Math.max(1, maxX - minX);
      const graphH = Math.max(1, maxY - minY);
      const k = clamp(
        Math.min((width - padding * 2) / graphW, (height - padding * 2) / graphH),
        MIN_ZOOM,
        1.6
      );
      const target = {
        k,
        x: width / 2 - ((minX + maxX) / 2) * k,
        y: height / 2 - ((minY + maxY) / 2) * k,
      };

      if (animate) animateTransform(target);
      else {
        cancelTween();
        setTransform(target);
      }
    },
    [animateTransform, cancelTween]
  );

  // ── Simulation loop ─────────────────────────────────────────────

  const runLoop = useCallback(() => {
    if (rafRef.current) return;

    const tick = () => {
      const sim = simRef.current;
      if (!sim) {
        rafRef.current = null;
        return;
      }

      sim.step(alphaRef.current);
      if (!dragRef.current?.node) alphaRef.current *= 0.968;
      setFrame((f) => f + 1);

      const busy = alphaRef.current > 0.004 || Boolean(dragRef.current?.node);
      if (busy) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      rafRef.current = null;
      // One tidy-up fit when the first layout comes to rest. Skipped once the
      // user has touched the canvas: a settle that arrives a second after you
      // started panning must not yank the view back out from under you. Later
      // settles — after a drag — leave the viewport alone for the same reason.
      if (!didFitRef.current) {
        didFitRef.current = true;
        fitToView(true);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [fitToView]);

  /** Wake the simulation back up, e.g. because a node was thrown. */
  const reheat = useCallback(
    (alpha = 0.4) => {
      alphaRef.current = Math.max(alphaRef.current, alpha);
      runLoop();
    },
    [runLoop]
  );

  // Measure the canvas. The layout is seeded from the real panel size, so a
  // wide window gets a wide graph instead of a square blob with dead margins.
  useEffect(() => {
    const el = containerRef.current;
    if (!isOpen || !el) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;
      sizeRef.current = { width, height };
      setMeasured(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isOpen]);

  // Build (or rebuild) the layout.
  useEffect(() => {
    if (!isOpen || !measured) return undefined;

    const { width, height } = sizeRef.current;
    const sim = createSimulation(filteredNotes, width, height);
    simRef.current = sim;
    setGraph({ nodes: sim.nodes, edges: sim.edges });
    alphaRef.current = 1;
    didFitRef.current = false;
    fitToView(false);
    runLoop();

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isOpen, measured, filteredNotes, layoutSeed, fitToView, runLoop]);

  useEffect(() => () => cancelTween(), [cancelTween]);

  useEffect(() => {
    if (!isOpen) {
      setHoveredNode(null);
      setFilter("all");
      setMeasured(false);
      simRef.current = null;
      setGraph({ nodes: [], edges: [] });
    }
  }, [isOpen]);

  // ── Pointer input ───────────────────────────────────────────────

  const pointerToGraph = useCallback((event) => {
    const rect = containerRef.current.getBoundingClientRect();
    const t = transformRef.current;
    return {
      x: (event.clientX - rect.left - t.x) / t.k,
      y: (event.clientY - rect.top - t.y) / t.k,
    };
  }, []);

  /**
   * Wheel semantics match every other graph view people arrive here from:
   * scroll zooms about the cursor, a trackpad pinch (which the platform sends
   * as ctrl+wheel) zooms harder, and shift scrolls sideways. Zoom is
   * exponential so one notch moves the same proportion at every scale — the
   * old linear step crawled when zoomed in and lurched when zoomed out.
   */
  useEffect(() => {
    const el = containerRef.current;
    if (!isOpen || !el) return undefined;

    const onWheel = (event) => {
      event.preventDefault();
      cancelTween();
      claimViewport();

      if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
        const dx = event.deltaX || event.deltaY;
        setTransform((prev) => ({ ...prev, x: prev.x - dx }));
        return;
      }

      const rect = el.getBoundingClientRect();
      const intensity = event.ctrlKey ? 0.012 : 0.002;
      zoomAtPoint(
        event.clientX - rect.left,
        event.clientY - rect.top,
        Math.exp(-event.deltaY * intensity)
      );
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isOpen, zoomAtPoint, cancelTween, claimViewport]);

  const handlePointerDownCanvas = useCallback(
    (event) => {
      if (event.button !== 0 && event.button !== 1) return;
      cancelTween();
      claimViewport();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        node: null,
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      setIsPanning(true);
    },
    [cancelTween, claimViewport]
  );

  const handlePointerDownNode = useCallback(
    (event, node) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      cancelTween();
      claimViewport();
      event.currentTarget.setPointerCapture(event.pointerId);

      const point = pointerToGraph(event);
      node.fx = node.x;
      node.fy = node.y;
      dragRef.current = {
        node,
        pointerId: event.pointerId,
        offsetX: node.x - point.x,
        offsetY: node.y - point.y,
        travel: 0,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      setDraggingNodeId(node.id);
      reheat(0.5);
    },
    [cancelTween, claimViewport, pointerToGraph, reheat]
  );

  const handlePointerMove = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;

      if (drag.node) {
        drag.travel += Math.abs(dx) + Math.abs(dy);
        const point = pointerToGraph(event);
        drag.node.fx = point.x + drag.offsetX;
        drag.node.fy = point.y + drag.offsetY;
        return;
      }

      setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    },
    [pointerToGraph]
  );

  const handlePointerUp = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;

      if (drag.node) {
        // Release it back into the simulation and let the graph answer.
        drag.node.fx = null;
        drag.node.fy = null;
        setDraggingNodeId(null);
        reheat(0.3);

        // A press that never travelled is a click, and a click opens the note.
        if (drag.travel < CLICK_SLOP) {
          selectNote(drag.node.id);
          onClose();
        }
        return;
      }

      setIsPanning(false);
    },
    [onClose, reheat, selectNote]
  );

  const handleZoomButton = useCallback(
    (factor) => {
      const { width, height } = sizeRef.current;
      cancelTween();
      zoomAtPoint(width / 2, height / 2, factor);
    },
    [cancelTween, zoomAtPoint]
  );

  const handleRedraw = useCallback(() => {
    setLayoutSeed((seed) => seed + 1);
  }, []);

  // ── Painting ────────────────────────────────────────────────────

  const getNodeColor = (node) => {
    const isActive = node.id === currentNoteId;
    const isHovered = hoveredNode === node.id || draggingNodeId === node.id;
    const isNeighbor = hoveredNode && hoveredNeighbors.has(node.id);
    const isDimmed = hoveredNode && !hoveredNeighbors.has(node.id);

    if (isActive)
      return {
        fill: "var(--color-accent)",
        stroke: "var(--color-accent)",
        opacity: 1,
        strokeWidth: 3,
      };
    if (isHovered)
      return {
        fill: "var(--color-accent)",
        stroke: "var(--color-accent)",
        opacity: 1,
        strokeWidth: 2.5,
      };
    if (isNeighbor)
      return {
        fill: "color-mix(in srgb, var(--color-accent) 60%, transparent)",
        stroke: "var(--color-accent)",
        opacity: 1,
        strokeWidth: 2,
      };
    if (isDimmed)
      return {
        fill: "var(--color-bg-editor)",
        stroke: "var(--color-border)",
        opacity: 0.3,
        strokeWidth: 1,
      };

    // Size-based colouring: more backlinks, a stronger accent wash. Leaf notes
    // read as neutral panel nodes with a muted ring (matches Vault design).
    const intensity = Math.min(1, node.backlinkCount * 0.2);
    return {
      fill:
        intensity > 0
          ? `color-mix(in srgb, var(--color-accent) ${Math.round(20 + intensity * 40)}%, var(--color-bg-editor))`
          : "var(--color-bg-editor)",
      stroke: intensity > 0 ? "var(--color-accent)" : "var(--color-text-muted)",
      opacity: 1,
      strokeWidth: 1.5,
    };
  };

  const handleExport = useCallback(
    async (format) => {
      if (nodes.length === 0) {
        addNotification("There is no graph data to export", "warning");
        return;
      }

      setExportingFormat(format);
      try {
        const titleSuffix =
          filter === "all"
            ? "All Notes"
            : filter === "connected"
              ? "Connected Notes"
              : "Orphaned Notes";
        const { svg, width, height } = buildGraphSvg({
          nodes,
          edges,
          currentNoteId,
          title: `Marky Graph • ${titleSuffix}`,
        });

        const filePath =
          format === "svg" ? await saveGraphSvg(svg) : await saveGraphPng(svg, width, height);

        if (filePath) {
          addNotification(`Graph exported as ${format.toUpperCase()}`, "success");
        }
      } catch (error) {
        console.error(`Failed to export graph as ${format}:`, error);
        addNotification(`Graph export failed: ${error.message}`, "error");
      } finally {
        setExportingFormat(null);
      }
    },
    [addNotification, currentNoteId, edges, filter, nodes]
  );

  if (!isOpen) return null;

  // Strokes and type are divided by the scale so they keep a constant size on
  // screen. Without it, hairlines vanish when you zoom out and labels grow to
  // headline size when you zoom in.
  const invK = 1 / transform.k;
  const showLabels = transform.k >= LABEL_ZOOM_FLOOR;
  const dotTile = Math.max(16, 28 * transform.k);

  return (
    <>
      <div
        className="fixed inset-0 z-50 animate-fadeIn bg-[rgba(30,25,15,0.38)] backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={dialogRef}
          className="glass-panel border-glass-border rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col pointer-events-auto animate-slideUp overflow-hidden"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="graph-modal-title"
          tabIndex={-1}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-glass-border px-6 py-4 shrink-0 bg-bg-base/40 backdrop-blur-md">
            <div>
              <h2 id="graph-modal-title" className="text-xl font-semibold text-text-primary">
                Note Graph
              </h2>
              <p className="text-sm text-text-muted mt-1">
                {stats.totalNotes} notes &middot; {stats.totalEdges} connections &middot;{" "}
                {stats.orphaned} orphaned
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Filter buttons */}
              <div className="flex items-center bg-overlay-subtle rounded-lg p-1 border border-overlay-light">
                {[
                  { value: "all", label: "All" },
                  { value: "connected", label: "Connected" },
                  { value: "orphaned", label: "Orphaned" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFilter(opt.value)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                      filter === opt.value
                        ? "bg-accent text-white shadow-sm"
                        : "text-text-secondary hover:text-text-primary hover:bg-overlay-light"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Zoom controls */}
              <div className="flex items-center bg-overlay-subtle rounded-lg p-1 border border-overlay-light">
                <button
                  onClick={() => handleZoomButton(1.25)}
                  className="p-1.5 hover:bg-overlay-light rounded-md text-text-secondary hover:text-text-primary transition-all"
                  title="Zoom in"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => handleZoomButton(0.8)}
                  className="p-1.5 hover:bg-overlay-light rounded-md text-text-secondary hover:text-text-primary transition-all"
                  title="Zoom out"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20 12H4"
                    />
                  </svg>
                </button>
                <div className="w-px h-4 bg-overlay-light mx-1" />
                <button
                  onClick={() => fitToView(true)}
                  className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider hover:bg-overlay-light rounded-md text-text-secondary hover:text-text-primary transition-all"
                  title="Fit the whole graph in view"
                >
                  Fit
                </button>
                <button
                  onClick={handleRedraw}
                  className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider hover:bg-overlay-light rounded-md text-text-secondary hover:text-text-primary transition-all"
                  title="Lay the graph out again from scratch"
                >
                  Redraw
                </button>
              </div>

              <div className="flex items-center bg-overlay-subtle rounded-lg p-1 border border-overlay-light">
                <button
                  onClick={() => handleExport("svg")}
                  disabled={exportingFormat !== null}
                  className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                    exportingFormat === "svg"
                      ? "bg-accent text-white"
                      : exportingFormat
                        ? "text-text-muted cursor-not-allowed"
                        : "text-text-secondary hover:text-text-primary hover:bg-overlay-light"
                  }`}
                  title="Export graph as SVG"
                >
                  {exportingFormat === "svg" ? "Saving..." : "SVG"}
                </button>
                <button
                  onClick={() => handleExport("png")}
                  disabled={exportingFormat !== null}
                  className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                    exportingFormat === "png"
                      ? "bg-accent text-white"
                      : exportingFormat
                        ? "text-text-muted cursor-not-allowed"
                        : "text-text-secondary hover:text-text-primary hover:bg-overlay-light"
                  }`}
                  title="Export graph as PNG"
                >
                  {exportingFormat === "png" ? "Saving..." : "PNG"}
                </button>
              </div>

              <button
                onClick={onClose}
                className="p-2 hover:bg-overlay-light rounded-lg transition-colors border border-border"
                title="Close"
              >
                <svg
                  className="w-5 h-5 text-text-secondary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Graph Area */}
          <div ref={containerRef} className="flex-1 relative bg-bg-editor/40 overflow-hidden">
            {measured && nodes.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-muted">
                <div className="text-center">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 opacity-20"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  <p className="text-base">
                    {filter === "orphaned"
                      ? "No orphaned notes found."
                      : filter === "connected"
                        ? "No connected notes found."
                        : "No notes yet. Use [[WikiLinks]] to connect your notes."}
                  </p>
                </div>
              </div>
            ) : (
              <svg
                data-graph-canvas=""
                className={`w-full h-full select-none touch-none ${
                  isPanning ? "cursor-grabbing" : "cursor-grab"
                }`}
                onPointerDown={handlePointerDownCanvas}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onDoubleClick={() => fitToView(true)}
              >
                <defs>
                  {/* A dot grid pinned to the transform. It costs one rect and
                      it is the difference between panning that reads as motion
                      and panning that reads as nothing happening. */}
                  <pattern
                    id="graph-dot-grid"
                    x={transform.x}
                    y={transform.y}
                    width={dotTile}
                    height={dotTile}
                    patternUnits="userSpaceOnUse"
                  >
                    <circle cx={1} cy={1} r={1} fill="var(--color-text-muted)" opacity={0.16} />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#graph-dot-grid)" />

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
                        stroke={isHighlighted ? "var(--color-accent)" : "var(--color-border)"}
                        strokeWidth={(isHighlighted ? 2 : 1) * invK}
                        opacity={isDimmed ? 0.08 : isHighlighted ? 0.85 : 0.4}
                      />
                    );
                  })}

                  {/* Nodes */}
                  {nodes.map((node) => {
                    const isActive = node.id === currentNoteId;
                    const radius = nodeRadius(node.backlinkCount);
                    const label =
                      node.name.length > 22 ? `${node.name.slice(0, 22)}...` : node.name;
                    const colors = getNodeColor(node);
                    const isFocused = hoveredNode === node.id || draggingNodeId === node.id;
                    const isFaded = hoveredNode && !hoveredNeighbors.has(node.id);

                    return (
                      <g
                        key={node.id}
                        onPointerEnter={() => setHoveredNode(node.id)}
                        onPointerLeave={() => setHoveredNode(null)}
                        onPointerDown={(event) => handlePointerDownNode(event, node)}
                        style={{ cursor: draggingNodeId === node.id ? "grabbing" : "pointer" }}
                      >
                        {(isFocused || isActive) && (
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={radius + 7 * invK}
                            fill="none"
                            stroke="var(--color-accent)"
                            strokeWidth={invK}
                            opacity={0.35}
                          />
                        )}
                        {/* An invisible collar, so small leaf nodes are still
                            easy to grab at low zoom. */}
                        <circle cx={node.x} cy={node.y} r={radius + 6 * invK} fill="transparent" />
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={radius}
                          fill={colors.fill}
                          stroke={colors.stroke}
                          strokeWidth={colors.strokeWidth * invK}
                          opacity={colors.opacity}
                        />
                        {(showLabels || isFocused) && (
                          <text
                            x={node.x}
                            y={node.y + radius + 13 * invK}
                            textAnchor="middle"
                            fontSize={11 * invK}
                            className="font-medium pointer-events-none"
                            fill={
                              isActive
                                ? "var(--color-accent)"
                                : isFocused
                                  ? "var(--color-text-primary)"
                                  : isFaded
                                    ? "var(--color-text-muted)"
                                    : "var(--color-text-secondary)"
                            }
                            opacity={isFaded && !isFocused ? 0.2 : 1}
                          >
                            {escapeTitle(label)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>
            )}

            {/* Zoom Indicator */}
            <div className="absolute bottom-4 right-6 px-2 py-1 bg-black/20 dark:bg-black/40 backdrop-blur rounded text-[10px] text-text font-mono border border-border pointer-events-none">
              {Math.round(transform.k * 100)}%
            </div>

            {/* Hover info tooltip */}
            {hoveredNode &&
              (() => {
                const node = nodes.find((n) => n.id === hoveredNode);
                if (!node) return null;
                return (
                  <div className="absolute top-4 left-4 bg-bg-sidebar/95 backdrop-blur border border-border rounded-lg px-4 py-3 shadow-xl max-w-xs pointer-events-none">
                    <p
                      className="text-sm font-semibold text-text-primary truncate"
                      title={node.name}
                    >
                      {node.name}
                    </p>
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
              <span>Drag a node to move it</span>
              <span>&middot;</span>
              <span>Double-click to fit</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default GraphModal;
