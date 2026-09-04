import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import type { Params } from "../../core/math/mlp";
import { SIZES } from "../../core/math/mlp";
import type { ThemeColors } from "../types";
import { neuronPosition } from "./layout";

export interface Weights {
  readonly group: Group;
  /**
   * One box per weight, in creation order: layer by layer, then the output neuron index, then the
   * input neuron index — the same order `Params.weights[l]` is stored in, row-major out×in.
   */
  readonly struts: readonly Mesh[];
  /** Sizes and colours every strut from the current parameters. */
  set(p: Params): void;
  setShow(on: boolean): void;
  dispose(): void;
}

/**
 * Struts sit further off the wall than the neurons do: a full-thickness strut is 0.14 deep, so half
 * of it would poke through the plane y = 0 at the neurons' 0.01 lift.
 */
const LIFT_STRUT = -0.08;

/** Thickness of a zero weight, and how much |w| = 3 (the cap) adds to it. */
const BASE_THICKNESS = 0.02;
const THICKNESS_GAIN = 0.12;

/** The box geometry's own long axis, which `set` rotates onto each strut's direction. */
const UP = new Vector3(0, 1, 0);

/** Neuron `i` of layer `l` as a world point at the strut lift. */
function strutEnd(l: number, i: number, out: Vector3): Vector3 {
  const [x, z] = neuronPosition(l, i);
  return out.set(x, LIFT_STRUT, z);
}

/**
 * The network's weights: one box strut per connection, spanning the two neurons it joins, its
 * thickness growing with |w| and its colour taken from the weight's sign — ink for positive,
 * accent for negative.
 *
 * One unit box is shared by every strut and scaled per mesh, and the two colours are two shared
 * materials swapped onto a mesh by sign, exactly as `neurons.ts` does. Each strut's position and
 * orientation are fixed by the layout, so `set` only rewrites scale and material.
 */
export function createWeights(theme: ThemeColors): Weights {
  const geometry = new BoxGeometry(1, 1, 1);
  const inkMaterial = new MeshStandardMaterial({ roughness: 0.5 });
  const accentMaterial = new MeshStandardMaterial({ roughness: 0.5 });

  const struts: Mesh[] = [];
  /** Distance between each strut's two neurons; the strut's y scale. */
  const lengths: number[] = [];

  const a = new Vector3();
  const b = new Vector3();
  const direction = new Vector3();
  const rotation = new Quaternion();

  for (let l = 0; l + 1 < SIZES.length; l++) {
    for (let o = 0; o < SIZES[l + 1]!; o++) {
      for (let i = 0; i < SIZES[l]!; i++) {
        strutEnd(l, i, a);
        strutEnd(l + 1, o, b);
        direction.subVectors(b, a);
        const length = direction.length();

        const mesh = new Mesh(geometry, inkMaterial);
        mesh.position.addVectors(a, b).multiplyScalar(0.5);
        mesh.quaternion.copy(rotation.setFromUnitVectors(UP, direction.normalize()));
        mesh.scale.set(BASE_THICKNESS, length, BASE_THICKNESS);
        struts.push(mesh);
        lengths.push(length);
      }
    }
  }

  const group = new Group();
  group.add(...struts);

  function applyTheme(): void {
    inkMaterial.color.copy(theme.ink);
    accentMaterial.color.copy(theme.accent);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  return {
    group,
    struts,

    set(p): void {
      let n = 0;
      for (let l = 0; l + 1 < SIZES.length; l++) {
        const inputs = SIZES[l]!;
        for (let o = 0; o < SIZES[l + 1]!; o++) {
          for (let i = 0; i < inputs; i++, n++) {
            const w = p.weights[l]?.[o * inputs + i] ?? 0;
            const t = BASE_THICKNESS + THICKNESS_GAIN * Math.min(1, Math.abs(w) / 3);
            const mesh = struts[n]!;
            mesh.scale.set(t, lengths[n]!, t);
            mesh.material = w < 0 ? accentMaterial : inkMaterial;
          }
        }
      }
    },

    setShow(on): void {
      group.visible = on;
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
