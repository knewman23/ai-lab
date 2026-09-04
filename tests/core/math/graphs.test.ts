import { describe, expect, it } from "vitest";
import { GRAPH_KEYS, GRAPHS } from "../../../src/core/math/graphs";
import type { Graph, GraphNode } from "../../../src/core/math/autograd";

function node(g: Graph, id: string): GraphNode {
  const n = g.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
}

describe("GRAPH_KEYS and GRAPHS table", () => {
  it("orders keys as in the spec table", () => {
    expect(GRAPH_KEYS).toEqual(["neuron", "product-sum", "shared-node"]);
  });

  it("gives every graph its key, its title and a non-empty hint", () => {
    for (const key of GRAPH_KEYS) {
      expect(GRAPHS[key].key).toBe(key);
      expect(GRAPHS[key].hint.length).toBeGreaterThan(0);
    }
    expect(GRAPHS.neuron.title).toBe("tanh neuron");
    expect(GRAPHS["product-sum"].title).toBe("a·b + c");
    expect(GRAPHS["shared-node"].title).toBe("L = e·c + e");
  });

  it("references only existing node ids from inputs, leaves and output", () => {
    for (const key of GRAPH_KEYS) {
      const g = GRAPHS[key];
      const ids = new Set(g.nodes.map((n) => n.id));
      expect(ids.size).toBe(g.nodes.length);
      expect(ids.has(g.output)).toBe(true);
      for (const n of g.nodes) {
        for (const input of n.inputs) expect(ids.has(input)).toBe(true);
        expect(n.op === "leaf").toBe(n.inputs.length === 0);
      }
      for (const leaf of g.leaves) expect(node(g, leaf.id).op).toBe("leaf");
    }
  });
});

describe("neuron", () => {
  const g = GRAPHS.neuron;

  it("has 10 nodes and output o", () => {
    expect(g.nodes).toHaveLength(10);
    expect(g.output).toBe("o");
  });

  it("has the notebook's leaves, starts and ranges", () => {
    expect(g.leaves).toEqual([
      { id: "x1", start: 2, range: [-4, 4] },
      { id: "w1", start: -3, range: [-4, 4] },
      { id: "x2", start: 0, range: [-4, 4] },
      { id: "w2", start: 1, range: [-4, 4] },
      { id: "b", start: 6.8813735870195432, range: [-8, 8] },
    ]);
  });

  it("labels and wires the nodes per the spec", () => {
    for (const id of ["x1", "w1", "x2", "w2", "b"]) {
      expect(node(g, id)).toEqual({ id, label: id, op: "leaf", inputs: [] });
    }
    expect(node(g, "x1w1")).toEqual({
      id: "x1w1",
      label: "x1·w1",
      op: "mul",
      inputs: ["x1", "w1"],
    });
    expect(node(g, "x2w2")).toEqual({
      id: "x2w2",
      label: "x2·w2",
      op: "mul",
      inputs: ["x2", "w2"],
    });
    expect(node(g, "sum")).toEqual({
      id: "sum",
      label: "x1·w1 + x2·w2",
      op: "add",
      inputs: ["x1w1", "x2w2"],
    });
    expect(node(g, "n")).toEqual({ id: "n", label: "n", op: "add", inputs: ["sum", "b"] });
    expect(node(g, "o")).toEqual({ id: "o", label: "o", op: "tanh", inputs: ["n"] });
  });
});

describe("product-sum", () => {
  const g = GRAPHS["product-sum"];

  it("has leaves a 2, b −3, c 10 on [−10, 10] and output d = ab + c", () => {
    expect(g.leaves).toEqual([
      { id: "a", start: 2, range: [-10, 10] },
      { id: "b", start: -3, range: [-10, 10] },
      { id: "c", start: 10, range: [-10, 10] },
    ]);
    expect(g.nodes).toHaveLength(5);
    expect(node(g, "ab")).toEqual({ id: "ab", label: "a·b", op: "mul", inputs: ["a", "b"] });
    expect(node(g, "d")).toEqual({ id: "d", label: "d", op: "add", inputs: ["ab", "c"] });
    expect(g.output).toBe("d");
  });
});

describe("shared-node", () => {
  const g = GRAPHS["shared-node"];

  it("has the same leaves and the nodes ab, e, f, L with output L", () => {
    expect(g.leaves).toEqual(GRAPHS["product-sum"].leaves);
    expect(g.nodes).toHaveLength(7);
    expect(node(g, "ab")).toEqual({ id: "ab", label: "a·b", op: "mul", inputs: ["a", "b"] });
    expect(node(g, "e")).toEqual({ id: "e", label: "e", op: "add", inputs: ["ab", "c"] });
    expect(node(g, "f")).toEqual({ id: "f", label: "f", op: "mul", inputs: ["e", "c"] });
    expect(node(g, "L")).toEqual({ id: "L", label: "L", op: "add", inputs: ["f", "e"] });
    expect(g.output).toBe("L");
  });
});
