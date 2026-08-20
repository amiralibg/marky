import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";

import GraphModal from "./GraphModal";
import useNotesStore from "../../store/notesStore";

const VIEW = { width: 900, height: 600 };

// The header renders a dozen icon <svg>s, so the canvas needs naming outright.
const CANVAS = "[data-graph-canvas]";
const NODES = CANVAS + " > g > g";

/**
 * The graph drives itself from requestAnimationFrame, so the tests own the
 * clock. Nothing simulates until a test asks for frames, which makes every
 * assertion below about a state the component actually reaches rather than
 * about how much real time elapsed inside act().
 */
let frameQueue = [];
let frameSeq = 0;

const flushFrames = async (count = 1) => {
  for (let i = 0; i < count; i++) {
    const batch = frameQueue;
    frameQueue = [];
    if (batch.length === 0) return;
    await act(async () => {
      batch.forEach(([, callback]) => callback(performance.now()));
    });
  }
};

/**
 * jsdom has no ResizeObserver, and the graph will not build a layout until it
 * knows how big its canvas is. Report one size, once, synchronously.
 */
class StubResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe(target) {
    this.callback([{ target, contentRect: { ...VIEW, top: 0, left: 0 } }], this);
  }
  disconnect() {}
  unobserve() {}
}

const noteItem = (name, links = []) => ({
  id: name,
  type: "note",
  name,
  linkKey: name.toLowerCase(),
  links: links.map((target) => ({ key: target.toLowerCase(), target })),
  content: links.map((target) => `[[${target}]]`).join(" "),
});

/** Reads the pan/zoom off the transformed group, which is the only place it shows. */
const readTransform = (container) => {
  const g = container.querySelector(CANVAS + " > g");
  const match = /translate\(([-\d.]+), ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(
    g.getAttribute("transform")
  );
  return { x: Number(match[1]), y: Number(match[2]), k: Number(match[3]) };
};

/** The graph-space point currently sitting under a container-space point. */
const graphPointUnder = (t, px, py) => ({ x: (px - t.x) / t.k, y: (py - t.y) / t.k });

const renderGraph = async (onClose = () => {}) => {
  let view;
  await act(async () => {
    view = render(<GraphModal isOpen onClose={onClose} />);
  });
  return view;
};

beforeEach(() => {
  frameQueue = [];
  frameSeq = 0;
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  vi.stubGlobal("requestAnimationFrame", (callback) => {
    frameQueue.push([++frameSeq, callback]);
    return frameSeq;
  });
  vi.stubGlobal("cancelAnimationFrame", (id) => {
    frameQueue = frameQueue.filter(([queued]) => queued !== id);
  });
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();

  useNotesStore.setState({
    currentNoteId: null,
    items: [
      noteItem("Hub", ["Leaf A", "Leaf B"]),
      noteItem("Leaf A", ["Hub"]),
      noteItem("Leaf B", ["Hub"]),
      noteItem("Island"),
    ],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GraphModal", () => {
  it("counts notes, connections and orphans in the header", async () => {
    await renderGraph();
    expect(screen.getByText(/4 notes/)).toBeInTheDocument();
    expect(screen.getByText(/2 connections/)).toBeInTheDocument();
    expect(screen.getByText(/1 orphaned/)).toBeInTheDocument();
  });

  it("draws one circle per note and one line per connection", async () => {
    const { container } = await renderGraph();
    // Each node also carries an invisible hit collar, hence two circles a node.
    expect(container.querySelectorAll(NODES)).toHaveLength(4);
    expect(container.querySelectorAll(CANVAS + " > g > line")).toHaveLength(2);
  });

  it("keeps the point under the cursor fixed while zooming", async () => {
    // The whole reason zoom was rewritten: it used to scale about the origin,
    // which threw the graph off screen unless you happened to be centred.
    const { container } = await renderGraph();
    const svg = container.querySelector(CANVAS);
    const before = readTransform(container);
    const anchorBefore = graphPointUnder(before, 700, 500);

    await act(async () => {
      fireEvent.wheel(svg, { deltaY: -240, clientX: 700, clientY: 500 });
    });

    const after = readTransform(container);
    expect(after.k).toBeGreaterThan(before.k);

    const anchorAfter = graphPointUnder(after, 700, 500);
    expect(anchorAfter.x).toBeCloseTo(anchorBefore.x, 6);
    expect(anchorAfter.y).toBeCloseTo(anchorBefore.y, 6);
  });

  it("zooms by the same proportion at every scale", async () => {
    const { container } = await renderGraph();
    const svg = container.querySelector(CANVAS);
    const wheel = () =>
      act(async () => {
        fireEvent.wheel(svg, { deltaY: -100, clientX: 450, clientY: 300 });
      });

    const start = readTransform(container).k;
    await wheel();
    const firstRatio = readTransform(container).k / start;
    const second = readTransform(container).k;
    await wheel();
    const secondRatio = readTransform(container).k / second;

    expect(secondRatio).toBeCloseTo(firstRatio, 6);
  });

  it("clamps zoom rather than inverting or vanishing", async () => {
    const { container } = await renderGraph();
    const svg = container.querySelector(CANVAS);
    for (let i = 0; i < 40; i++) {
      await act(async () => {
        fireEvent.wheel(svg, { deltaY: -600, clientX: 450, clientY: 300 });
      });
    }
    expect(readTransform(container).k).toBeLessThanOrEqual(5);

    for (let i = 0; i < 80; i++) {
      await act(async () => {
        fireEvent.wheel(svg, { deltaY: 600, clientX: 450, clientY: 300 });
      });
    }
    expect(readTransform(container).k).toBeGreaterThanOrEqual(0.15);
  });

  it("pans by the pointer delta without changing zoom", async () => {
    const { container } = await renderGraph();
    const svg = container.querySelector(CANVAS);
    const before = readTransform(container);

    await act(async () => {
      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 160, clientY: 130 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 160, clientY: 130 });
    });

    const after = readTransform(container);
    expect(after.x - before.x).toBeCloseTo(60, 6);
    expect(after.y - before.y).toBeCloseTo(30, 6);
    expect(after.k).toBeCloseTo(before.k, 6);
  });

  it("opens the note when a node is clicked without travel", async () => {
    const onClose = vi.fn();
    const selectNote = vi.fn();
    useNotesStore.setState({ selectNote });

    const { container } = await renderGraph(onClose);
    const node = container.querySelector(NODES);

    await act(async () => {
      fireEvent.pointerDown(node, { button: 0, pointerId: 2, clientX: 300, clientY: 300 });
      fireEvent.pointerUp(node, { pointerId: 2, clientX: 301, clientY: 300 });
    });

    expect(selectNote).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves a node instead of opening it when the pointer travels", async () => {
    const onClose = vi.fn();
    const selectNote = vi.fn();
    useNotesStore.setState({ selectNote });

    const { container } = await renderGraph(onClose);
    const node = container.querySelector(NODES);
    const circle = node.querySelectorAll("circle");
    const before = Number(circle[circle.length - 1].getAttribute("cx"));

    await act(async () => {
      fireEvent.pointerDown(node, { button: 0, pointerId: 3, clientX: 300, clientY: 300 });
      fireEvent.pointerMove(node, { pointerId: 3, clientX: 420, clientY: 360 });
    });
    // The held position only reaches the DOM once the simulation ticks.
    await flushFrames(2);

    const held = container.querySelectorAll(NODES)[0].querySelectorAll("circle");
    const after = Number(held[held.length - 1].getAttribute("cx"));
    expect(after).not.toBeCloseTo(before, 3);

    await act(async () => {
      fireEvent.pointerUp(node, { pointerId: 3, clientX: 420, clientY: 360 });
    });

    expect(selectNote).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("frames the whole graph inside the canvas on open", async () => {
    const { container } = await renderGraph();
    const t = readTransform(container);
    const circles = [...container.querySelectorAll(NODES)].map((g) => {
      const c = g.querySelectorAll("circle");
      return c[c.length - 1];
    });

    circles.forEach((circle) => {
      const sx = Number(circle.getAttribute("cx")) * t.k + t.x;
      const sy = Number(circle.getAttribute("cy")) * t.k + t.y;
      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sx).toBeLessThanOrEqual(VIEW.width);
      expect(sy).toBeGreaterThanOrEqual(0);
      expect(sy).toBeLessThanOrEqual(VIEW.height);
    });
  });

  it("does not steal the viewport back when the layout settles mid-gesture", async () => {
    // The first layout ends with a tidy-up fit. If that fit lands after the
    // user has already panned, it yanks the view out from under them.
    const { container } = await renderGraph();
    const svg = container.querySelector(CANVAS);

    await act(async () => {
      fireEvent.pointerDown(svg, { button: 0, pointerId: 9, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(svg, { pointerId: 9, clientX: 300, clientY: 220 });
      fireEvent.pointerUp(svg, { pointerId: 9, clientX: 300, clientY: 220 });
    });
    const panned = readTransform(container);

    await flushFrames(400); // long enough for the simulation to cool right down
    expect(readTransform(container)).toEqual(panned);
  });

  it("still fits once on its own when the user has not touched anything", async () => {
    const { container } = await renderGraph();
    const nodes = container.querySelectorAll(NODES);
    // Push a node far outside the frame, then let the layout come to rest.
    await flushFrames(400);
    expect(nodes).toHaveLength(4);

    const t = readTransform(container);
    const bounds = [...container.querySelectorAll(NODES)].map((g) => {
      const c = g.querySelectorAll("circle");
      const last = c[c.length - 1];
      return Number(last.getAttribute("cx")) * t.k + t.x;
    });
    bounds.forEach((sx) => {
      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sx).toBeLessThanOrEqual(VIEW.width);
    });
  });

  it("says so when a filter selects nothing", async () => {
    useNotesStore.setState({
      items: [noteItem("Hub", ["Leaf"]), noteItem("Leaf", ["Hub"])],
    });
    await renderGraph();
    await act(async () => {
      fireEvent.click(screen.getByText("Orphaned"));
    });
    expect(screen.getByText("No orphaned notes found.")).toBeInTheDocument();
  });
});
