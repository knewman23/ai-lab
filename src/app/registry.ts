import type { RegistryEntry } from "../viz/types";

/**
 * Card metadata lives here, next to a loader for the scene's own chunk, so the
 * home page renders without pulling in Three.js or KaTeX.
 */
export const REGISTRY: readonly RegistryEntry[] = [
  {
    id: "derivative-tangent",
    topic: "calculus",
    title: "Derivative & tangent",
    summary:
      "Drag a point along a curve and watch the tangent, the secant limit and the derivative curve respond; zoom in to see the curve become its tangent.",
    status: "ready",
    load: () => import("../viz/derivative").then((m) => m.derivativeExplorer),
  },
  {
    id: "chain-rule-graph",
    topic: "calculus",
    title: "Chain rule graph",
    summary:
      "Drag x along a composed function and watch a small Δx become Δu on the front wall, then Δy on the side wall and the floor: the three slopes multiply.",
    status: "ready",
    load: () => import("../viz/chain-rule").then((m) => m.chainRuleGraph),
  },
  {
    id: "matrix-transformation",
    topic: "linear-algebra",
    title: "Matrix transformation",
    summary:
      "Drag the two basis vectors and watch the plane, the unit square, the determinant and the eigenvectors respond.",
    status: "ready",
    load: () => import("../viz/matrix-transformation").then((m) => m.matrixTransformation),
  },
  {
    id: "gradient-descent",
    topic: "machine-learning",
    title: "Gradient descent",
    summary:
      "Drag a point across a 3D loss surface and watch the gradient, the tangent plane and the optimizer's path respond.",
    status: "ready",
    load: () => import("../viz/gradient-descent").then((m) => m.gradientDescent),
  },
  {
    id: "backprop-graph",
    topic: "machine-learning",
    title: "Backprop graph",
    summary:
      "Step through the forward and backward passes of a small autograd graph: values fill in, then gradients flow back along every edge with the local derivative written on it.",
    status: "ready",
    load: () => import("../viz/backprop").then((m) => m.backpropGraph),
  },
  {
    id: "neural-network",
    topic: "machine-learning",
    title: "Neural network",
    summary:
      "Watch layers, activations, and weights, shown as edge thickness, animate through a live forward pass.",
    status: "soon",
  },
  {
    id: "gpt-transformer",
    topic: "machine-learning",
    title: "GPT transformer",
    summary:
      "Explore token embeddings, attention heads as weighted arcs, and the residual stream of a GPT-style transformer.",
    status: "soon",
  },
];

export function findEntry(topic: string, id: string): RegistryEntry | undefined {
  return REGISTRY.find((entry) => entry.topic === topic && entry.id === id);
}
