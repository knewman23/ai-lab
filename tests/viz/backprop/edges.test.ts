import { describe, expect, it, vi } from "vitest";
import type { Graph, GraphNode } from "../../../src/core/math/autograd";
import { GRAPHS } from "../../../src/core/math/graphs";
import { createThemeColors } from "../../../src/core/theme";
import { createEdges } from "../../../src/viz/backprop/edges";
import { activeEdgeSegments, edgeSegments } from "../../../src/viz/backprop/edges-geometry";
import { layoutGraph } from "../../../src/viz/backprop/layout";

const neuron = GRAPHS.neuron;
const layout = layoutGraph(neuron);

describe("edgeSegments", () => {
  it("returns one segment per (input -> node) edge of the neuron, in declaration order", () => {
    const segments = edgeSegments(neuron, layout);
    expect(segments).toHaveLength(9);
    const expected: readonly [string, string][] = [
      ["x1", "x1w1"],
      ["w1", "x1w1"],
      ["x2", "x2w2"],
      ["w2", "x2w2"],
      ["x1w1", "sum"],
      ["x2w2", "sum"],
      ["sum", "n"],
      ["b", "n"],
      ["n", "o"],
    ];
    expected.forEach(([from, to], i) => {
      const [a, b] = segments[i]!;
      expect(a).toEqual([layout[from]![0], -0.01, layout[from]![1]]);
      expect(b).toEqual([layout[to]![0], -0.01, layout[to]![1]]);
    });
  });

  it("gives the shared-node graph 8 edges", () => {
    const g = GRAPHS["shared-node"];
    expect(edgeSegments(g, layoutGraph(g))).toHaveLength(8);
  });
});

describe("activeEdgeSegments", () => {
  it("returns only the edges into the node", () => {
    const segments = activeEdgeSegments(neuron, layout, "n");
    expect(segments).toHaveLength(2);
    expect(segments[0]![0]).toEqual([layout.sum![0], -0.01, layout.sum![1]]);
    expect(segments[1]![0]).toEqual([layout.b![0], -0.01, layout.b![1]]);
    for (const [, to] of segments) expect(to).toEqual([layout.n![0], -0.01, layout.n![1]]);
  });

  it("is empty for a leaf", () => {
    expect(activeEdgeSegments(neuron, layout, "x1")).toEqual([]);
  });
});

function make() {
  const theme = createThemeColors(() => "#1f4ed8");
  return { edges: createEdges(theme), theme };
}

describe("createEdges", () => {
  it("draws 18 endpoints for the neuron's nine edges", () => {
    const { edges } = make();
    edges.set(neuron, layout);
    expect(edges.layers.all.geometry.drawRange.count).toBe(18);
    expect(edges.layers.active.geometry.drawRange.count).toBe(0);
    edges.dispose();
  });

  it("setActive fills the active layer with the edges into the node, and empties it for null", () => {
    const { edges } = make();
    edges.set(neuron, layout);
    edges.setActive(neuron, layout, "n");
    expect(edges.layers.active.geometry.drawRange.count).toBe(4);
    edges.setActive(neuron, layout, null);
    expect(edges.layers.active.geometry.drawRange.count).toBe(0);
    edges.dispose();
  });

  it("uses --line for all edges and --accent for active ones, at render orders 2 and 3", () => {
    const { edges, theme } = make();
    expect(edges.layers.all.material.color.equals(theme.line)).toBe(true);
    expect(edges.layers.active.material.color.equals(theme.accent)).toBe(true);
    expect(edges.layers.all.object.renderOrder).toBe(2);
    expect(edges.layers.active.object.renderOrder).toBe(3);
    expect(edges.layers.all.kind).toBe("world");
    edges.dispose();
  });

  it("throws in DEV when a graph has more edges than the buffer holds", () => {
    const { edges } = make();
    // 13 add nodes each fed by two leaves: 26 edges, more than the 12-edge buffer.
    const nodes: GraphNode[] = [
      { id: "p", label: "p", op: "leaf", inputs: [] },
      { id: "q", label: "q", op: "leaf", inputs: [] },
      ...Array.from({ length: 13 }, (_, i): GraphNode => {
        return { id: `s${i}`, label: `s${i}`, op: "add", inputs: ["p", "q"] };
      }),
    ];
    const big: Graph = { key: "big", title: "big", nodes, output: "s0", leaves: [], hint: "" };
    const positions = Object.fromEntries(nodes.map((n, i) => [n.id, [i, 1] as const]));
    expect(() => edges.set(big, positions)).toThrow(/do not fit/);
    edges.dispose();
  });

  it("dispose releases both layers and drops the theme listener", () => {
    const { edges, theme } = make();
    const remove = vi.spyOn(theme, "removeEventListener");
    const spies = Object.values(edges.layers).flatMap((l) => [
      vi.spyOn(l.geometry, "dispose"),
      vi.spyOn(l.material, "dispose"),
    ]);
    edges.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
