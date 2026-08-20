/**
 * An incremental force-directed layout for the note graph.
 *
 * The previous version ran 200 iterations inside a `useMemo` and handed back
 * finished coordinates. That blocked the main thread on open, hid the settle
 * entirely, and — because it was a pure function of the note list — left no way
 * to push a node around and watch the graph answer. This version owns mutable
 * nodes and exposes one `step()`, so the render loop drives it and a drag can
 * reheat it.
 */
export const createSimulation = (notes, width, height) => {
  const count = notes.length;
  if (count === 0) return { nodes: [], edges: [], step: () => {} };

  const cx = width / 2;
  const cy = height / 2;
  const initRadius = Math.min(width, height) * 0.32;

  const nodes = notes.map((note, i) => {
    // Golden-angle placement rather than an even ring: an even ring is a
    // symmetric starting state, and symmetric states unfold symmetrically —
    // into another ring, instead of into clusters.
    const angle = i * 2.399963;
    const r = initRadius * Math.sqrt((i + 0.5) / count);
    return {
      ...note,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      vx: 0,
      vy: 0,
      degree: 0,
      fx: null, // set while a pointer is holding this node
      fy: null,
    };
  });

  const nodesByKey = new Map(nodes.map((node) => [node.linkKey, node]));
  const edges = [];
  const pairs = new Set();

  nodes.forEach((node) => {
    node.links.forEach((link) => {
      const target = nodesByKey.get(link.key);
      if (!target || target.id === node.id) return;
      const pairKey = [node.id, target.id].sort().join(" ");
      if (pairs.has(pairKey)) return;
      pairs.add(pairKey);
      edges.push({ source: node, target });
      node.degree += 1;
      target.degree += 1;
    });
  });

  const REPULSION = 2600;
  const ATTRACTION = 0.02;
  const IDEAL_LENGTH = 130;
  const CENTER_GRAVITY = 0.012;
  const DAMPING = 0.82;
  const MIN_DIST = 34;

  const step = (alpha) => {
    for (let i = 0; i < count; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < count; j++) {
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 1) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          distSq = 1;
        }
        const dist = Math.sqrt(distSq);
        const force = (REPULSION * alpha) / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    for (let i = 0; i < edges.length; i++) {
      const { source, target } = edges[i];
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      // Divide the spring by the lighter endpoint's degree. Without it, a note
      // with eight links gets dragged toward whichever side happens to hold the
      // most neighbours, and hubs end up on the rim instead of in the middle.
      const stiffness = ATTRACTION / Math.max(1, Math.min(source.degree, target.degree) || 1);
      const force = stiffness * (dist - IDEAL_LENGTH) * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    }

    for (let i = 0; i < count; i++) {
      const node = nodes[i];

      if (node.fx !== null) {
        // Held by a pointer: the drag owns the position outright, and zeroing
        // velocity stops the node springing away the instant it is released.
        node.x = node.fx;
        node.y = node.fy;
        node.vx = 0;
        node.vy = 0;
        continue;
      }

      node.vx += (cx - node.x) * CENTER_GRAVITY * alpha;
      node.vy += (cy - node.y) * CENTER_GRAVITY * alpha;
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      node.x += node.vx;
      node.y += node.vy;
    }

    // Overlap relaxation. There is no bounding box any more — pan and zoom do
    // the framing, so clamping into a fixed square only squashed big vaults.
    for (let i = 0; i < count; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < count; j++) {
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= MIN_DIST) continue;
        if (dist < 1) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          dist = 1;
        }
        const overlap = (MIN_DIST - dist) / 2;
        const ox = (dx / dist) * overlap;
        const oy = (dy / dist) * overlap;
        if (a.fx === null) {
          a.x -= ox;
          a.y -= oy;
        }
        if (b.fx === null) {
          b.x += ox;
          b.y += oy;
        }
      }
    }
  };

  // A short synchronous warm-up, so the first painted frame is already a graph
  // rather than a spiral of dots unwinding from the centre.
  for (let i = 0; i < 24; i++) step(1);

  return { nodes, edges, step };
};

/** Tight bounds around every node, including its drawn radius. */
export const graphBounds = (nodes, radiusOf) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach((node) => {
    const r = radiusOf(node);
    minX = Math.min(minX, node.x - r);
    minY = Math.min(minY, node.y - r);
    maxX = Math.max(maxX, node.x + r);
    maxY = Math.max(maxY, node.y + r);
  });

  return { minX, minY, maxX, maxY };
};
