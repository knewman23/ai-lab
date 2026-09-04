import { Group, Mesh, MeshStandardMaterial, SphereGeometry } from "three";
import { SIZES } from "../../core/math/mlp";
import type { ThemeColors } from "../types";
import { LIFT_WALL, neuronPosition } from "./layout";

export interface Neurons {
  readonly group: Group;
  /** One mesh per neuron, layer-major (layer 0 first); read by tests and by the labels. */
  readonly meshes: readonly Mesh[];
  /** Sizes and colours every neuron from one activation per layer, in `SIZES` order. */
  set(activations: readonly ArrayLike<number>[]): void;
  dispose(): void;
}

/** Radius of a neuron with activation 0, and how much |a| = 1 adds to it. */
const BASE_RADIUS = 0.08;
const RADIUS_GAIN = 0.14;
/** Above the flat layers on the wall, as the chain-rule spheres are. */
const ORDER = 10;

/**
 * The network's neurons: one sphere per unit, sitting on the wall at its layout
 * point, its radius growing with |activation| and its colour taken from the
 * activation's sign — ink for positive, accent for negative.
 *
 * One unit-radius geometry is shared by every sphere and scaled per mesh, and
 * the two colours are two shared materials swapped onto a mesh by sign, so a
 * theme change recolours two materials and touches nothing per object.
 */
export function createNeurons(theme: ThemeColors): Neurons {
  const geometry = new SphereGeometry(1, 20, 12);
  const inkMaterial = new MeshStandardMaterial({ roughness: 0.5 });
  const accentMaterial = new MeshStandardMaterial({ roughness: 0.5 });

  const meshes: Mesh[] = [];
  for (let l = 0; l < SIZES.length; l++) {
    for (let i = 0; i < SIZES[l]!; i++) {
      const [x, z] = neuronPosition(l, i);
      const mesh = new Mesh(geometry, inkMaterial);
      mesh.position.set(x + LIFT_WALL[0], LIFT_WALL[1], z + LIFT_WALL[2]);
      mesh.scale.setScalar(BASE_RADIUS);
      mesh.renderOrder = ORDER;
      meshes.push(mesh);
    }
  }

  const group = new Group();
  group.add(...meshes);

  function applyTheme(): void {
    inkMaterial.color.copy(theme.ink);
    accentMaterial.color.copy(theme.accent);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  return {
    group,
    meshes,

    set(activations): void {
      let n = 0;
      for (let l = 0; l < SIZES.length; l++) {
        for (let i = 0; i < SIZES[l]!; i++, n++) {
          const a = activations[l]?.[i] ?? 0;
          const mesh = meshes[n]!;
          mesh.scale.setScalar(BASE_RADIUS + RADIUS_GAIN * Math.min(1, Math.abs(a)));
          mesh.material = a < 0 ? accentMaterial : inkMaterial;
        }
      }
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      geometry.dispose();
      inkMaterial.dispose();
      accentMaterial.dispose();
    },
  };
}
