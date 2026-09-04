import type { Graph, GraphNode, Leaf } from "./autograd";

export type GraphKey = "neuron" | "product-sum" | "shared-node";

/** Ordered as in the spec's preset table; `neuron` is the default. */
export const GRAPH_KEYS = [
  "neuron",
  "product-sum",
  "shared-node",
] as const satisfies readonly GraphKey[];

function leaf(id: string, start: number, range: readonly [number, number]): Leaf {
  return { id, start, range };
}

function leafNode(id: string): GraphNode {
  return { id, label: id, op: "leaf", inputs: [] };
}

/** a, b, c leaves shared by the two small graphs. */
const ABC_LEAVES: readonly Leaf[] = [
  leaf("a", 2, [-10, 10]),
  leaf("b", -3, [-10, 10]),
  leaf("c", 10, [-10, 10]),
];
const ABC_NODES: readonly GraphNode[] = [
  leafNode("a"),
  leafNode("b"),
  leafNode("c"),
  { id: "ab", label: "a·b", op: "mul", inputs: ["a", "b"] },
];

export const GRAPHS: Readonly<Record<GraphKey, Graph & { readonly key: GraphKey }>> = {
  neuron: {
    key: "neuron",
    title: "tanh neuron",
    leaves: [
      leaf("x1", 2, [-4, 4]),
      leaf("w1", -3, [-4, 4]),
      leaf("x2", 0, [-4, 4]),
      leaf("w2", 1, [-4, 4]),
      leaf("b", 6.8813735870195432, [-8, 8]),
    ],
    nodes: [
      leafNode("x1"),
      leafNode("w1"),
      leafNode("x2"),
      leafNode("w2"),
      leafNode("b"),
      { id: "x1w1", label: "x1·w1", op: "mul", inputs: ["x1", "w1"] },
      { id: "x2w2", label: "x2·w2", op: "mul", inputs: ["x2", "w2"] },
      { id: "sum", label: "x1·w1 + x2·w2", op: "add", inputs: ["x1w1", "x2w2"] },
      { id: "n", label: "n", op: "add", inputs: ["sum", "b"] },
      { id: "o", label: "o", op: "tanh", inputs: ["n"] },
    ],
    output: "o",
    hint: "The notebook's single neuron: two weighted inputs, a bias, then tanh.",
  },
  "product-sum": {
    key: "product-sum",
    title: "a·b + c",
    leaves: ABC_LEAVES,
    nodes: [...ABC_NODES, { id: "d", label: "d", op: "add", inputs: ["ab", "c"] }],
    output: "d",
    hint: "The smallest graph with both rules: + passes the gradient through, × swaps in the other input's value.",
  },
  "shared-node": {
    key: "shared-node",
    title: "L = e·c + e",
    leaves: ABC_LEAVES,
    nodes: [
      ...ABC_NODES,
      { id: "e", label: "e", op: "add", inputs: ["ab", "c"] },
      { id: "f", label: "f", op: "mul", inputs: ["e", "c"] },
      { id: "L", label: "L", op: "add", inputs: ["f", "e"] },
    ],
    output: "L",
    hint: "e feeds both f and L, so e.grad is the sum of two contributions, 1 from L and 10 from f: that is why backward uses +=.",
  },
};
