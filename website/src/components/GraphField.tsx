import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { FeatureId } from "./featureData";

type NodeDef = {
  id: FeatureId;
  label: string;
  hx: number;
  hy: number;
};

const NODES: NodeDef[] = [
  { id: "local", label: "Inbox", hx: 0.18, hy: 0.28 },
  { id: "wiki", label: "[[Wiki]]", hx: 0.46, hy: 0.18 },
  { id: "graph", label: "Graph", hx: 0.78, hy: 0.26 },
  { id: "search", label: "Search", hx: 0.28, hy: 0.58 },
  { id: "editor", label: "Daily", hx: 0.58, hy: 0.52 },
  { id: "math", label: "KaTeX", hx: 0.82, hy: 0.62 },
  { id: "themes", label: "Themes", hx: 0.42, hy: 0.82 },
  { id: "templates", label: "Daily.md", hx: 0.16, hy: 0.84 },
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

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
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
      className="relative h-[300px] w-full overflow-hidden rounded-md border border-line bg-surface sm:h-[380px] md:h-[460px]"
      onMouseMove={onMove}
      onMouseLeave={() => {
        mouse.current.inside = false;
        setHover(null);
      }}
    >
      <p className="kicker pointer-events-none absolute left-5 top-5 z-10">Graph · live</p>
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
              stroke={hot ? "var(--color-accent)" : "var(--color-line)"}
              strokeWidth={hot ? 1.6 : 1}
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
            className="absolute z-10 min-h-10 -translate-x-1/2 -translate-y-1/2 rounded-pill border px-3 py-2 text-[13px] font-medium transition-colors duration-200"
            style={{
              left: `${node.hx * 100}%`,
              top: `${node.hy * 100}%`,
              background: selected ? "var(--color-ink)" : "var(--color-surface)",
              color: selected
                ? "var(--color-surface)"
                : hot
                  ? "var(--color-ink)"
                  : "color-mix(in srgb, var(--color-ink) 40%, transparent)",
              borderColor: selected ? "var(--color-ink)" : "var(--color-line)",
              opacity: hot ? 1 : 0.55,
            }}
          >
            {node.label}
          </button>
        );
      })}
    </div>
  );
}
