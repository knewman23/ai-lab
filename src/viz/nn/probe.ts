import { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry } from "three";
import type { ThemeColors } from "../types";
import { floorPoint } from "./layout";

export interface Probe {
  readonly group: Group;
  /** The visible sphere. */
  readonly mesh: Mesh;
  /** Invisible pick volume around the sphere, for the drag raycast. */
  readonly hitTarget: Mesh;
  /**
   * Stands both spheres on the floor at input `p`. Not clamped: `setProbe` owns
   * keeping the probe in the domain.
   */
  set(p: readonly [number, number]): void;
  dispose(): void;
}

/** Sphere radius, which is also how far it stands off the floor plane so it rests on it. */
const RADIUS = 0.12;
/** The pick volume is wider than the sphere, so the drag stays forgiving at this camera distance. */
const HIT_RADIUS = 0.25;
/**
 * Matches `neurons.ts`. It is not what keeps the sphere above the floor: the sphere is opaque and
 * the floor transparent, so three draws them in separate passes and `renderOrder` only sorts within
 * one. The opaque sphere is drawn first and writes depth, and the floor then composites behind it.
 */
const ORDER = 10;

/**
 * The draggable probe: a soft sphere standing on the floor at the current input,
 * with an invisible pick volume around it for the drag raycast.
 *
 * The pick volume uses an invisible *material* rather than `mesh.visible = false`,
 * so the raycast hits it whichever way three treats invisible objects (three's
 * Raycaster tests layers and materials, not `object.visible`); nothing is drawn
 * either way. That much is the `chain-rule/points.ts` recipe. The visible sphere
 * deliberately is not: that scene's spheres are `transparent` because they sit in
 * a stack of flat coplanar layers, whereas this one is merely tangent to the
 * floor, so leave it opaque -- it writes depth and the transparent floor
 * composites behind it.
 */
export function createProbe(theme: ThemeColors): Probe {
  const geometry = new SphereGeometry(RADIUS, 24, 16);
  const hitGeometry = new SphereGeometry(HIT_RADIUS, 12, 8);
  const material = new MeshStandardMaterial({ roughness: 0.5 });
  const hitMaterial = new MeshBasicMaterial({ visible: false });

  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = ORDER;
  const hitTarget = new Mesh(hitGeometry, hitMaterial);

  const group = new Group();
  group.add(mesh, hitTarget);

  function applyTheme(): void {
    material.color.copy(theme.soft);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  return {
    group,
    mesh,
    hitTarget,

    set(p): void {
      const [x, y, z] = floorPoint(p);
      mesh.position.set(x, y, z + RADIUS);
      hitTarget.position.copy(mesh.position);
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      geometry.dispose();
      hitGeometry.dispose();
      material.dispose();
      hitMaterial.dispose();
    },
  };
}
