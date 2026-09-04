import type { Graph } from "../../core/math/autograd";
import { nodeById } from "../../core/math/autograd";
import type { Segment, Vec3 } from "../shared/layer";
import { segment } from "../shared/lift";
import type { Positions } from "./layout";

/** Lift off the wall toward -y, the camera side, so edges are not z-fought by the wall. */
export const LIFT_WALL: Vec3 = [0, -0.01, 0];

/** Where a node sits on the wall (y = 0), from its layout (X, Z). */
function onWall(positions: Positions, id: string): Vec3 {
  const p = positions[id];
  if (p === undefined) throw new Error(`edges: node "${id}" has no layout position`);
  return [p[0], 0, p[1]];
}

/** The lifted segment from `from` to `to` on the wall. */
function edge(positions: Positions, from: string, to: string): Segment {
  return segment(onWall(positions, from), onWall(positions, to), LIFT_WALL);
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
