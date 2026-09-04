import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import type { Graph } from "../../core/math/autograd";
import type { Positions } from "./layout";
import { wallPoint } from "./layout";

export interface HitBoxes {
  /** Invisible pick volumes, one per leaf in `leafIds` order, for the drag raycast. */
  readonly targets: readonly Mesh[];
  /** Leaf ids in the graph's leaf order; `targets[i]` belongs to `leafIds[i]`. */
  readonly leafIds: readonly string[];
  /** Recreates the boxes for `g`'s leaves, adding them to `group`. */
  rebuild(g: Graph, group: Group): void;
  /** Centres each box on its leaf's value-bar axis, `dx` from the node's X. */
  place(positions: Positions, dx: number): void;
  /** Releases the shared geometry and material; the meshes belong to the caller's group. */
  dispose(): void;
}

const HIT_W = 0.4;
/** Spans y ∈ [−3.2, 3.2], so a zero-valued leaf is still grabbable. */
const HIT_H = 6.4;

/**
 * The drag targets for leaf value bars: 0.4 × 6.4 × 0.4 boxes with an invisible *material*
 * on a visible mesh, so the raycast hits them whichever way three treats invisible objects.
 */
export function createHitBoxes(): HitBoxes {
  const geometry = new BoxGeometry(HIT_W, HIT_H, HIT_W);
  const material = new MeshBasicMaterial({ visible: false });
  const targets: Mesh[] = [];
  const leafIds: string[] = [];

  return {
    targets,
    leafIds,

    rebuild(g, group): void {
      targets.length = 0;
      leafIds.length = 0;
      for (const leaf of g.leaves) {
        const hit = new Mesh(geometry, material);
        targets.push(hit);
        leafIds.push(leaf.id);
        group.add(hit);
      }
    },

    place(positions, dx): void {
      leafIds.forEach((id, i) => {
        const [x, , z] = wallPoint(positions, id);
        targets[i]!.position.set(x - dx, 0, z);
      });
    },

    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
