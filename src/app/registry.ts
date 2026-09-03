import { TOPICS, type RegistryEntry, type TopicSlug } from "../viz/types";

export const REGISTRY: readonly RegistryEntry[] = [
  {
    id: "derivative-tangent",
    topic: "calculus",
    title: "Derivative & tangent explorer",
    summary:
      "Drag along a 1D function to watch its secant line collapse into the tangent line at a point.",
    status: "soon",
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
      "Drag the basis vectors and watch a unit cube deform, with the determinant shown as volume and eigenvectors as the lines that don't turn.",
    status: "soon",
  },
  {
    id: "backprop-graph",
    topic: "machine-learning",
    title: "Backprop graph",
    summary:
      "See the Value autograd graph from ai-frontier notebook 01 laid out in 3D with forward and backward animation.",
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

export function entriesByTopic(): Map<TopicSlug, RegistryEntry[]> {
  const map = new Map<TopicSlug, RegistryEntry[]>();
  for (const topic of TOPICS) {
    map.set(topic.slug, []);
  }
  for (const entry of REGISTRY) {
    map.get(entry.topic)!.push(entry);
  }
  return map;
}

export function findEntry(topic: string, id: string): RegistryEntry | undefined {
  return REGISTRY.find((entry) => entry.topic === topic && entry.id === id);
}
