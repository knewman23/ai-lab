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
      "Follow how a change at the input of a composed function propagates through each nested layer.",
    status: "soon",
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
      "See the autograd graph behind backpropagation, laid out in 3D with forward and backward passes animated.",
    status: "soon",
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
