import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import type { Graph } from "../../core/math/autograd";
import { GRAPHS } from "../../core/math/graphs";
import type { Positions } from "./layout";
import { wallPoint } from "./layout";

export interface HitBoxes {
  /**
   * Invisible pick volumes for the drag raycast: a fixed pool of `MAX_LEAVES`, allocated once so
   * `attachDrag` can snapshot the array. `targets[i]` belongs to `leafIds[i]`; the rest are hidden.
   */
  readonly targets: readonly Mesh[];
  /** Leaf ids in the current graph's leaf order; rewritten in place on rebuild. */
  readonly leafIds: readonly string[];
  /** Assigns the first `g.leaves.length` boxes to `g`'s leaves and hides the others; re-adds all to `group`. */
  rebuild(g: Graph, group: Group): void;
  /** Centres each box on its leaf's value-bar axis, `dx` from the node's X. */
  place(positions: Positions, dx: number): void;
  /** Releases the shared geometry and material; the meshes belong to the caller's group. */
  dispose(): void;
}

const HIT_W = 0.4;
/** Spans y ∈ [−3.2, 3.2], so a zero-valued leaf is still grabbable. */
const HIT_H = 6.4;
/** The most leaves any preset has; the pool never grows. */
const MAX_LEAVES = Math.max(...Object.values(GRAPHS).map((g) => g.leaves.length));

/**
 * The drag targets for leaf value bars: 0.4 × 6.4 × 0.4 boxes with an invisible *material*
 * on a visible mesh, so the raycast hits them whichever way three treats invisible objects.
 * Boxes not in use by the current graph have `visible = false`, which the raycast skips.
 */
export function createHitBoxes(): HitBoxes {
  const geometry = new BoxGeometry(HIT_W, HIT_H, HIT_W);
  const material = new MeshBasicMaterial({ visible: false });
  const targets: Mesh[] = Array.from({ length: MAX_LEAVES }, () => new Mesh(geometry, material));
  const leafIds: string[] = [];

  return {
    targets,
    leafIds,

    rebuild(g, group): void {
      if (import.meta.env.DEV && g.leaves.length > MAX_LEAVES) {
        throw new Error(`hit-boxes: ${g.leaves.length} leaves exceed the pool of ${MAX_LEAVES}`);
      }
      leafIds.length = 0;
      for (const leaf of g.leaves) leafIds.push(leaf.id);
      targets.forEach((hit, i) => {
        hit.visible = i < leafIds.length;
        group.add(hit);
      });
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
