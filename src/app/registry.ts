import { derivativeExplorer } from "../viz/derivative";
import { gradientDescent } from "../viz/gradient-descent";
import { matrixTransformation } from "../viz/matrix-transformation";
import type { RegistryEntry } from "../viz/types";

export const REGISTRY: readonly RegistryEntry[] = [
  derivativeExplorer,
  {
    id: "chain-rule-graph",
    topic: "calculus",
    title: "Chain rule graph",
    summary:
      "Follow how a change at the input of a composed function propagates through each nested layer.",
    status: "soon",
  },
  matrixTransformation,
  gradientDescent,
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
