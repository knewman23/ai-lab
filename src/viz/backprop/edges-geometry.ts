import type { Graph } from "../../core/math/autograd";
import { nodeById } from "../../core/math/autograd";
import type { Segment } from "../shared/layer";
import { segment } from "../shared/lift";
import { LIFT_WALL, type Positions, wallPoint } from "./layout";

/** The lifted segment from `from` to `to` on the wall. */
function edge(positions: Positions, from: string, to: string): Segment {
  return segment(wallPoint(positions, from), wallPoint(positions, to), LIFT_WALL);
}

/**
 * One segment per (input -> node) edge, from the input's position to the
 * consumer's, in a deterministic order: nodes in declaration order, each
 * node's inputs in order.
 */
export function edgeSegments(g: Graph, positions: Positions): readonly Segment[] {
  return g.nodes.flatMap((node) => node.inputs.map((input) => edge(positions, input, node.id)));
}

/** The edges into `node` only, in input order; empty for a leaf. */
export function activeEdgeSegments(
  g: Graph,
  positions: Positions,
  node: string,
): readonly Segment[] {
  return nodeById(g, node).inputs.map((input) => edge(positions, input, node));
}
