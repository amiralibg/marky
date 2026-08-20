import { describe, it, expect } from "vitest";
import { createSimulation, graphBounds } from "./graphSimulation";

const note = (name, links = [], backlinkCount = 0) => ({
  id: name,
  name,
  linkKey: name.toLowerCase(),
  links: links.map((target) => ({ key: target.toLowerCase(), target })),
  backlinkCount,
});

const vault = () => [
  note("Hub", ["Leaf A", "Leaf B"], 2),
  note("Leaf A", ["Hub"], 1),
  note("Leaf B", ["Hub"], 1),
  note("Island"),
];

describe("createSimulation", () => {
  it("returns an empty layout for an empty vault", () => {
    const sim = createSimulation([], 800, 600);
    expect(sim.nodes).toEqual([]);
    expect(sim.edges).toEqual([]);
    expect(() => sim.step(1)).not.toThrow();
  });

  it("builds one edge per linked pair, in either direction", () => {
    // Hub->Leaf A and Leaf A->Hub is one connection, not two.
    const sim = createSimulation(vault(), 800, 600);
    expect(sim.edges).toHaveLength(2);
  });

  it("ignores links that point at notes outside the filtered set", () => {
    const sim = createSimulation([note("Only", ["Missing"])], 800, 600);
    expect(sim.edges).toHaveLength(0);
  });

  it("counts degree from resolved edges only", () => {
    const sim = createSimulation(vault(), 800, 600);
    const byName = Object.fromEntries(sim.nodes.map((n) => [n.name, n]));
    expect(byName.Hub.degree).toBe(2);
    expect(byName["Leaf A"].degree).toBe(1);
    expect(byName.Island.degree).toBe(0);
  });

  it("keeps every coordinate finite through a full cooling run", () => {
    const sim = createSimulation(vault(), 800, 600);
    let alpha = 1;
    for (let i = 0; i < 300; i++) {
      sim.step(alpha);
      alpha *= 0.968;
    }
    sim.nodes.forEach((node) => {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    });
  });

  it("separates nodes that start on top of each other", () => {
    const sim = createSimulation([note("A"), note("B")], 800, 600);
    sim.nodes[0].x = 400;
    sim.nodes[0].y = 300;
    sim.nodes[1].x = 400;
    sim.nodes[1].y = 300;
    sim.step(1);
    const dx = sim.nodes[0].x - sim.nodes[1].x;
    const dy = sim.nodes[0].y - sim.nodes[1].y;
    expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThan(0);
  });

  it("pins a node to its fixed position while it is held", () => {
    const sim = createSimulation(vault(), 800, 600);
    const held = sim.nodes[0];
    held.fx = 42;
    held.fy = 99;
    for (let i = 0; i < 20; i++) sim.step(1);
    expect(held.x).toBe(42);
    expect(held.y).toBe(99);
  });

  it("lets a released node move again", () => {
    const sim = createSimulation(vault(), 800, 600);
    const node = sim.nodes[0];
    node.fx = 4000;
    node.fy = 4000;
    sim.step(1);
    node.fx = null;
    node.fy = null;
    for (let i = 0; i < 20; i++) sim.step(1);
    // Centre gravity and its springs pull it back off the far corner.
    expect(node.x).toBeLessThan(4000);
  });
});

describe("graphBounds", () => {
  it("includes each node's drawn radius", () => {
    const bounds = graphBounds(
      [
        { x: 0, y: 0, backlinkCount: 0 },
        { x: 100, y: 50, backlinkCount: 0 },
      ],
      () => 10
    );
    expect(bounds).toEqual({ minX: -10, minY: -10, maxX: 110, maxY: 60 });
  });
});
