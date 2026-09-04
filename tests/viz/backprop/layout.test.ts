import { describe, expect, it } from "vitest";
import { nodeById } from "../../../src/core/math/autograd";
import { GRAPHS } from "../../../src/core/math/graphs";
import { WALL_H, WALL_W, Z_RANGE, layoutGraph } from "../../../src/viz/backprop/layout";

function columns(pos: Readonly<Record<string, readonly [number, number]>>): number[] {
  return [...new Set(Object.values(pos).map(([x]) => x))].sort((a, b) => a - b);
}

describe("backprop layout", () => {
  it("exports the wall dimensions and row range", () => {
    expect(WALL_W).toBe(10);
    expect(WALL_H).toBe(6);
    expect(Z_RANGE).toEqual([0.8, 5.2]);
  });

  it("neuron: 5 columns at X = -4, -2, 0, 2, 4", () => {
    const pos = layoutGraph(GRAPHS.neuron);
    expect(Object.keys(pos).sort()).toEqual(GRAPHS.neuron.nodes.map((n) => n.id).sort());
    const xs = columns(pos);
    expect(xs).toHaveLength(5);
    xs.forEach((x, i) => expect(x).toBeCloseTo(-4 + 2 * i));
  });

  it("neuron: the leaf column maps declaration order to decreasing Z", () => {
    const pos = layoutGraph(GRAPHS.neuron);
    const expected: Record<string, number> = { x1: 5.2, w1: 4.1, x2: 3, w2: 1.9, b: 0.8 };
    for (const [id, z] of Object.entries(expected)) {
      expect(pos[id]?.[0]).toBeCloseTo(-4);
      expect(pos[id]?.[1]).toBeCloseTo(z);
    }
  });

  it("neuron: a single-row column sits at Z = 3; o is at (4, 3)", () => {
    const pos = layoutGraph(GRAPHS.neuron);
    expect(pos.o?.[0]).toBeCloseTo(4);
    expect(pos.o?.[1]).toBeCloseTo(3);
    expect(pos.sum?.[1]).toBeCloseTo(3);
    expect(pos.n?.[1]).toBeCloseTo(3);
  });

  it("neuron: rows in a non-leaf column follow the mean Z of their inputs", () => {
    const pos = layoutGraph(GRAPHS.neuron);
    // x1w1 averages x1 (5.2) and w1 (4.1); x2w2 averages x2 (3) and w2 (1.9): x1w1 sits higher.
    expect(pos.x1w1?.[1]).toBeCloseTo(5.2);
    expect(pos.x2w2?.[1]).toBeCloseTo(0.8);
  });

  it("product-sum has 3 columns; shared-node has 5", () => {
    expect(columns(layoutGraph(GRAPHS["product-sum"]))).toHaveLength(3);
    const shared = layoutGraph(GRAPHS["shared-node"]);
    const xs = columns(shared);
    expect(xs).toHaveLength(5);
    const col = (id: string): number => xs.indexOf(shared[id]?.[0] ?? NaN);
    expect(["a", "b", "c"].map(col)).toEqual([0, 0, 0]);
    expect(col("ab")).toBe(1);
    expect(col("e")).toBe(2);
    expect(col("f")).toBe(3);
    expect(col("L")).toBe(4);
  });

  it.each(Object.values(GRAPHS))(
    "$key: edges go to a greater X and no two nodes share a position",
    (g) => {
      const pos = layoutGraph(g);
      for (const node of g.nodes) {
        for (const input of node.inputs) {
          expect(nodeById(g, input)).toBeDefined();
          expect(pos[input]?.[0] as number).toBeLessThan(pos[node.id]?.[0] as number);
        }
      }
      const keys = Object.values(pos).map(([x, z]) => `${x.toFixed(6)},${z.toFixed(6)}`);
      expect(new Set(keys).size).toBe(g.nodes.length);
      for (const [, z] of Object.values(pos)) {
        expect(z).toBeGreaterThanOrEqual(Z_RANGE[0] - 1e-9);
        expect(z).toBeLessThanOrEqual(Z_RANGE[1] + 1e-9);
      }
    },
  );
});
