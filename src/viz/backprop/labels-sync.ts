import type { Op } from "../../core/math/autograd";
import { fmt } from "../../ui/readout";
import type { LabelLayer } from "../shared/labels";
import type { Vec3 } from "../shared/layer";
import { barTransform } from "./bars-geometry";
import { edgeLabel } from "./explanation";
import { type Positions, wallPoint } from "./layout";
import type { Derived, ShowKey } from "./state";

/** How far above the sphere (along +z) a node's name hangs. */
const NODE_LIFT = 0.3;
/** Offset of the value bar (−) and the grad bar (+) from the node's X; matches bars.ts. */
const BAR_DX = 0.12;

const OP_SYMBOL: Readonly<Record<Exclude<Op, "leaf">, string>> = {
  add: "+",
  mul: "×",
  tanh: "tanh",
};

/** The world point at the tip of a bar for quantity `v`: positive bars point toward −y. */
function barTip(x: number, z: number, kind: "value" | "grad", v: number): Vec3 {
  const { length } = barTransform(kind, v, true);
  return [x, v < 0 ? length : -length, z];
}

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

/**
 * Writes every label the current state calls for into `labels`, and removes the
 * rest: each node's name above its sphere, an op symbol on op spheres, the value
 * and gradient at their bars' tips once revealed (and shown), and the local
 * derivative on every edge into the node of the current backward step. Labels
 * keep stable ids (`n:`, `op:`, `v:`, `g:`, `e:` prefixes), so the layer rewrites
 * spans in place instead of recreating them.
 */
export function syncLabels(
  labels: LabelLayer,
  d: Derived,
  positions: Positions,
  show: Readonly<Record<ShowKey, boolean>>,
): void {
  const { graph } = d;
  const backwardAt = d.current?.kind === "backward" ? d.current.node : null;

  for (const node of graph.nodes) {
    const id = node.id;
    const [x, y, z] = wallPoint(positions, id);

    labels.set(`n:${id}`, node.label, [x, y, z + NODE_LIFT], "node");

    if (node.op !== "leaf") labels.set(`op:${id}`, OP_SYMBOL[node.op], [x, y, z], "op");

    const value = d.values[id];
    if (show.values && value !== undefined && d.revealed.values.has(id)) {
      labels.set(`v:${id}`, fmt(value), barTip(x - BAR_DX, z, "value", value), "value");
    } else {
      labels.remove(`v:${id}`);
    }

    const grad = d.grads[id];
    if (show.grads && grad !== undefined) {
      labels.set(`g:${id}`, `∂ ${fmt(grad)}`, barTip(x + BAR_DX, z, "grad", grad), "grad");
    } else {
      labels.remove(`g:${id}`);
    }

    node.inputs.forEach((input, i) => {
      const key = `e:${input}>${id}`;
      if (show.edgeDerivs && backwardAt === id) {
        const at = midpoint(wallPoint(positions, input), [x, y, z]);
        labels.set(key, edgeLabel(graph, id, i, d.values), at, "edge");
      } else {
        labels.remove(key);
      }
    });
  }
}
