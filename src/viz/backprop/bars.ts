import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import type { Graph, Revealed, Values } from "../../core/math/autograd";
import type { ThemeColors } from "../types";
import { type BarKind, barTransform, Eased } from "./bars-geometry";
import { createHitBoxes } from "./hit-boxes";
import type { Positions } from "./layout";
import { wallPoint } from "./layout";

/** The two bars of one node. */
export interface BarPair {
  readonly value: Mesh;
  readonly grad: Mesh;
}

/** Why `Bars.set` is being called; decides whether changes ease or jump. */
export type SetCause = "step" | "edit";

export interface Bars {
  readonly group: Group;
  /** Invisible pick volumes, one per leaf in `leafIds` order, for the drag raycast. */
  readonly hitTargets: readonly Mesh[];
  /** Leaf ids in the graph's leaf order; `hitTargets[i]` belongs to `leafIds[i]`. */
  readonly leafIds: readonly string[];
  /** Node id → its bars, for the current graph; read by tests. */
  readonly bars: ReadonlyMap<string, BarPair>;
  /**
   * Places every bar; a value bar shows iff its value is revealed, a grad bar iff `id in grads`.
   * On `"step"` (a pass step, a graph switch, mount) changed or newly revealed bars ease; on
   * `"edit"` (a leaf edit) every change is instant.
   */
  set(
    g: Graph,
    positions: Positions,
    values: Values,
    grads: Values,
    revealed: Revealed,
    show: { readonly values: boolean; readonly grads: boolean },
    cause: SetCause,
  ): void;
  /** Advances the eased lengths; true while any bar is still moving. */
  update(dtMs: number): boolean;
  dispose(): void;
}

/** Offset of the value bar (−) and the grad bar (+) from the node's X. */
const BAR_DX = 0.12;
const BAR_SIDE = 0.16;

/** One bar's mesh plus the eased length that drives it. */
interface Bar {
  readonly mesh: Mesh;
  readonly kind: BarKind;
  readonly length: Eased;
  x: number;
  z: number;
  /** The sign of the quantity, for the centre's side of the wall. */
  negative: boolean;
  revealed: boolean;
}

/**
 * Two boxes per node scaled along y: the value bar (`--soft`) at X − 0.12 and the grad bar
 * (`--accent`) at X + 0.12, pointing toward −y for positive quantities and +y for negative.
 * All bars share one geometry and one material per kind (visibility is per mesh). On a step a
 * bar eases (from 0 when newly revealed, else from its current length, so an accumulating
 * gradient animates); a leaf edit jumps; under `reducedMotion` everything jumps. Hit boxes (`hit-boxes.ts`) are rebuilt with the graph.
 */
export function createBars(theme: ThemeColors, reducedMotion: boolean): Bars {
  const barGeometry = new BoxGeometry(BAR_SIDE, 1, BAR_SIDE);
  const valueMaterial = new MeshStandardMaterial({ roughness: 0.5 });
  const gradMaterial = new MeshStandardMaterial({ roughness: 0.5 });
  const hits = createHitBoxes();

  const group = new Group();
  const pairs = new Map<string, BarPair>();
  const all: Bar[] = [];
  let currentKey: string | null = null;

  function applyTheme(): void {
    valueMaterial.color.copy(theme.soft);
    gradMaterial.color.copy(theme.accent);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  function makeBar(kind: BarKind): Bar {
    const mesh = new Mesh(barGeometry, kind === "value" ? valueMaterial : gradMaterial);
    mesh.visible = false;
    group.add(mesh);
    const length = new Eased(reducedMotion);
    return { mesh, kind, length, x: 0, z: 0, negative: false, revealed: false };
  }

  function rebuild(g: Graph): void {
    // Shared geometries and materials survive; the meshes are just dropped.
    group.clear();
    pairs.clear();
    all.length = 0;
    for (const node of g.nodes) {
      const value = makeBar("value");
      const grad = makeBar("grad");
      all.push(value, grad);
      pairs.set(node.id, { value: value.mesh, grad: grad.mesh });
    }
    hits.rebuild(g, group);
    currentKey = g.key;
  }

  /** Writes the bar's eased length into its mesh. */
  function apply(bar: Bar): void {
    const length = bar.length.value;
    bar.mesh.scale.y = length;
    bar.mesh.position.set(bar.x, bar.negative ? length / 2 : -length / 2, bar.z);
  }

  /** Retargets one bar for quantity `v`; on a step it eases (from 0 when newly revealed). */
  function place(bar: Bar, v: number, revealed: boolean, shown: boolean, cause: SetCause): void {
    const t = barTransform(bar.kind, v, revealed);
    bar.negative = v < 0;
    if (t.visible && !bar.revealed) bar.length.set(0, { instant: true });
    bar.length.set(t.length, { instant: cause === "edit" || !t.visible });
    bar.revealed = t.visible;
    bar.mesh.visible = shown && t.visible;
    apply(bar);
  }

  return {
    group,
    hitTargets: hits.targets,
    leafIds: hits.leafIds,
    bars: pairs,

    set(g, positions, values, grads, revealed, show, cause): void {
      if (g.key !== currentKey) rebuild(g);
      let i = 0;
      for (const node of g.nodes) {
        const id = node.id;
        const [x, , z] = wallPoint(positions, id);
        // `all` holds two bars per node in node order: value then grad (see rebuild).
        const value = all[i++]!;
        const grad = all[i++]!;
        value.x = x - BAR_DX;
        grad.x = x + BAR_DX;
        value.z = grad.z = z;
        place(value, values[id] ?? 0, revealed.values.has(id), show.values, cause);
        place(grad, grads[id] ?? 0, id in grads, show.grads, cause);
      }
      hits.place(positions, BAR_DX);
    },

    update(dtMs): boolean {
      let moving = false;
      for (const bar of all) {
        if (!bar.length.moving) continue;
        // Apply after the final frame too, so the bar lands exactly on its target.
        if (bar.length.advance(dtMs)) moving = true;
        apply(bar);
      }
      return moving;
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      barGeometry.dispose();
      valueMaterial.dispose();
      gradMaterial.dispose();
      hits.dispose();
    },
  };
}
