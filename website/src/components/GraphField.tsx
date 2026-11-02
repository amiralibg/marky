import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { FeatureId } from "./featureData";

type NodeDef = {
  id: FeatureId;
  label: string;
  hx: number;
  hy: number;
  /** Node diameter, which in the app grows with a note's link count. */
  size: number;
};

const NODES: NodeDef[] = [
  { id: "local", label: "Inbox", hx: 0.14, hy: 0.3, size: 24 },
  { id: "wiki", label: "Wiki links", hx: 0.4, hy: 0.2, size: 34 },
  { id: "quiet", label: "Quiet", hx: 0.68, hy: 0.16, size: 18 },
  { id: "graph", label: "Graph", hx: 0.86, hy: 0.36, size: 26 },
  { id: "search", label: "Search", hx: 0.27, hy: 0.6, size: 26 },
  { id: "editor", label: "Daily", hx: 0.56, hy: 0.5, size: 40 },
  { id: "math", label: "KaTeX", hx: 0.78, hy: 0.7, size: 22 },
  { id: "themes", label: "Themes", hx: 0.48, hy: 0.82, size: 24 },
  { id: "templates", label: "Templates", hx: 0.14, hy: 0.84, size: 22 },
];

const EDGES: Array<[FeatureId, FeatureId]> = [
  ["local", "wiki"],
  ["wiki", "graph"],
  ["local", "search"],
  ["search", "editor"],
  ["wiki", "editor"],
  ["editor", "math"],
  ["graph", "math"],
  ["search", "templates"],
  ["editor", "themes"],
  ["templates", "themes"],
  ["wiki", "quiet"],
  ["quiet", "graph"],
];

type LiveNode = NodeDef & { x: number; y: number; vx: number; vy: number };

type Props = {
  active: FeatureId | null;
  onSelect: (id: FeatureId) => void;
};

export default function GraphField({ active, onSelect }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const lineRefs = useRef<Record<string, SVGLineElement | null>>({});
  const [hover, setHover] = useState<FeatureId | null>(null);
  const mouse = useRef({ x: 0.5, y: 0.5, inside: false });
  const nodesRef = useRef<LiveNode[]>(
    NODES.map((node) => ({ ...node, x: node.hx, y: node.hy, vx: 0, vy: 0 }))
  );

  useEffect(() => {
    const el = wrapRef.current;
    const svg = svgRef.current;
    if (!el || !svg) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = el.clientWidth;
    let h = el.clientHeight;

    const ro = new ResizeObserver(() => {
      w = el.clientWidth;
      h = el.clientHeight;
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));
      // Under reduced motion there is no frame loop to pick the new size up.
      if (reduce) paint();
    });
    ro.observe(el);
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));

    const paint = () => {
      const nodes = nodesRef.current;
      for (const node of nodes) {
        const btn = btnRefs.current[node.id];
        if (btn) {
          btn.style.left = `${node.x * w}px`;
          btn.style.top = `${node.y * h}px`;
        }
      }
      for (const [a, b] of EDGES) {
        const na = nodes.find((n) => n.id === a);
        const nb = nodes.find((n) => n.id === b);
        const line = lineRefs.current[`${a}-${b}`];
        if (!na || !nb || !line) continue;
        line.setAttribute("x1", String(na.x * w));
        line.setAttribute("y1", String(na.y * h));
        line.setAttribute("x2", String(nb.x * w));
        line.setAttribute("y2", String(nb.y * h));
      }
    };

    const tick = () => {
      if (!reduce) {
        nodesRef.current = nodesRef.current.map((node) => {
          const mx = mouse.current.inside ? mouse.current.x : 0.5;
          const my = mouse.current.inside ? mouse.current.y : 0.5;
          const dxm = node.x - mx;
          const dym = node.y - my;
          const dist = Math.max(0.08, Math.hypot(dxm, dym));
          const force = mouse.current.inside ? 0.00035 / dist : 0;
          let vx = node.vx + (node.hx - node.x) * 0.04 + dxm * force;
          let vy = node.vy + (node.hy - node.y) * 0.04 + dym * force;
          vx *= 0.86;
          vy *= 0.86;
          return { ...node, x: node.x + vx, y: node.y + vy, vx, vy };
        });
      }
      paint();
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    // Reduced motion has no animation to run, so paint the resting layout once
    // instead of scheduling a frame forever.
    if (reduce) {
      paint();
    } else {
      // Only animate while the graph is actually on screen; this used to spin
      // the CPU for the whole page even when scrolled far away.
      const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()), {
        threshold: 0,
      });
      io.observe(el);
      return () => {
        stop();
        io.disconnect();
        ro.disconnect();
      };
    }

    return () => {
      stop();
      ro.disconnect();
    };
  }, []);

  const lit = hover ?? active;

  const connected = useMemo(() => {
    if (!lit) return new Set<FeatureId>();
    const set = new Set<FeatureId>([lit]);
    for (const [a, b] of EDGES) {
      if (a === lit) set.add(b);
      if (b === lit) set.add(a);
    }
    return set;
  }, [lit]);

  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    mouse.current = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
      inside: true,
    };
  };

  return (
    <div
      ref={wrapRef}
      className="relative h-[340px] w-full overflow-hidden rounded-md border border-line sm:h-[420px] md:h-[520px]"
      style={{
        // Solid, so its dot grid is not fighting the ruled paper behind it.
        backgroundColor: "var(--color-surface)",
        backgroundImage:
          "radial-gradient(color-mix(in srgb, var(--color-ink) 12%, transparent) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
      onMouseMove={onMove}
      onMouseLeave={() => {
        mouse.current.inside = false;
        setHover(null);
      }}
    >
      <svg ref={svgRef} className="absolute inset-0" aria-hidden>
        {EDGES.map(([a, b]) => {
          const hot = lit
            ? connected.has(a) && connected.has(b) && (a === lit || b === lit)
            : false;
          return (
            <line
              key={`${a}-${b}`}
              ref={(el) => {
                lineRefs.current[`${a}-${b}`] = el;
              }}
              x1={0}
              y1={0}
              x2={0}
              y2={0}
              stroke={hot ? "var(--color-accent)" : "var(--color-line-strong)"}
              strokeWidth={hot ? 1.5 : 1}
            />
          );
        })}
      </svg>
      {NODES.map((node) => {
        const hot = !lit || connected.has(node.id);
        const selected = lit === node.id;
        return (
          <button
            key={node.id}
            ref={(el) => {
              btnRefs.current[node.id] = el;
            }}
            type="button"
            onMouseEnter={() => setHover(node.id)}
            onFocus={() => setHover(node.id)}
            onClick={() => onSelect(node.id)}
            className="absolute z-10 flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 transition-opacity duration-150"
            style={{
              left: `${node.hx * 100}%`,
              top: `${node.hy * 100}%`,
              opacity: hot ? 1 : 0.4,
            }}
          >
            <span
              aria-hidden
              className="block rounded-pill border border-accent transition-colors duration-150"
              style={{
                width: node.size,
                height: node.size,
                background: selected
                  ? "var(--color-accent)"
                  : "color-mix(in srgb, var(--color-accent) 30%, var(--color-surface))",
              }}
            />
            <span
              className={`whitespace-nowrap text-[12px] font-medium ${
                selected ? "text-accent-text" : "text-ink-soft"
              }`}
            >
              {node.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
