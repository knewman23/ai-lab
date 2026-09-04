import type { Graph } from "../../core/math/autograd";
import { nodeById } from "../../core/math/autograd";

/** Width (X extent) of the wall the graph is drawn on; columns are spread across it. */
export const WALL_W = 10;
/** Height (Z extent) of the wall. */
export const WALL_H = 6;
/** Z of the lowest and highest rows in a multi-row column. */
export const Z_RANGE: readonly [number, number] = [0.8, 5.2];

/** Node id → (X, Z) on the wall. */
export type Positions = Readonly<Record<string, readonly [number, number]>>;

/** Node id → longest path from a leaf (leaves 0). Recursion is bounded by the graph being a DAG. */
function depths(g: Graph): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  const depth = (id: string): number => {
    const known = out.get(id);
    if (known !== undefined) return known;
    const inputs = nodeById(g, id).inputs;
    const d = inputs.length === 0 ? 0 : 1 + Math.max(...inputs.map(depth));
    out.set(id, d);
    return d;
  };
  for (const node of g.nodes) depth(node.id);
  return out;
}

/** Z of row i of n: `Z_RANGE[1]` down to `Z_RANGE[0]`; a single row sits at the midpoint. */
function rowZ(i: number, n: number): number {
  const [lo, hi] = Z_RANGE;
  return n <= 1 ? (lo + hi) / 2 : hi - (i * (hi - lo)) / (n - 1);
}

/**
 * Places nodes in columns by depth, X = −W/2 + (depth + 0.5)·W/cols. Rows within a column run
 * top-down: leaves in declaration order; other nodes by the mean Z of their inputs (higher mean
 * first, ties by declaration order) so edges cross as little as possible.
 */
export function layoutGraph(g: Graph): Positions {
  const depth = depths(g);
  const cols = Math.max(...depth.values()) + 1;
  const colW = WALL_W / cols;
  const pos: Record<string, readonly [number, number]> = {};
  for (let c = 0; c < cols; c++) {
    const ids = g.nodes.filter((n) => depth.get(n.id) === c).map((n) => n.id);
    const placedZ = (input: string): number => {
      const z = pos[input]?.[1];
      if (z === undefined) throw new Error(`layout: input "${input}" placed after its consumer`);
      return z;
    };
    const meanZ = (id: string): number => {
      const inputs = nodeById(g, id).inputs;
      return inputs.reduce((acc, input) => acc + placedZ(input), 0) / inputs.length;
    };
    // Array.prototype.sort is stable, so equal means keep declaration order.
    const ordered = c === 0 ? ids : [...ids].sort((a, b) => meanZ(b) - meanZ(a));
    const x = -WALL_W / 2 + (c + 0.5) * colW;
    ordered.forEach((id, i) => {
      pos[id] = [x, rowZ(i, ordered.length)];
    });
  }
  return pos;
}
