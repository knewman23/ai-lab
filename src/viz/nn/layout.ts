import { SIZES } from "../../core/math/mlp";
import type { Vec3 } from "../shared/layer";

/** Width (X extent) of the wall the network is drawn on; the four layers are spread across it. */
export const WALL_W = 10;
/** Height (Z extent) of the wall. */
export const WALL_H = 6;
/** Z of the lowest and highest neuron in a multi-neuron layer. */
const Z_RANGE: readonly [number, number] = [0.8, 5.2];

/** Side length of the square floor, which is the input domain [−3, 3]². */
export const FLOOR_SIZE = 6;
/** World y of the floor's centre: the floor sits on the camera's side of the wall. */
export const FLOOR_CY = -3.5;

/**
 * Lift off the wall toward −y, the camera side, so things drawn on it are not z-fought by the wall.
 * Declared here rather than taken from `shared/lift.ts`, whose front-face lift points the other way.
 */
export const LIFT_WALL: Vec3 = [0, -0.01, 0];

/**
 * Where neuron `i` of layer `l` sits on the wall, as (X, Z). Layers are evenly spaced columns,
 * X = −W/2 + (l + 0.5)·W/4; within a column the neurons run top-down from Z 5.2 to 0.8, and a lone
 * neuron sits at the midpoint. Throws on a layer index the architecture does not have.
 */
export function neuronPosition(l: number, i: number): readonly [number, number] {
  const n = SIZES[l];
  if (n === undefined) throw new Error(`nn layout: no layer ${l}`);
  const x = -WALL_W / 2 + (l + 0.5) * (WALL_W / SIZES.length);
  const [lo, hi] = Z_RANGE;
  const z = n <= 1 ? (lo + hi) / 2 : hi - (i * (hi - lo)) / (n - 1);
  return [x, z];
}

/** Input (x₁, x₂) → the world point on the floor plane z = 0 that represents it. */
export function floorPoint(x: readonly [number, number]): Vec3 {
  return [x[0], FLOOR_CY + x[1], 0];
}

/** The inverse of `floorPoint`, dropping z. Not clamped: `setProbe` owns keeping the probe in the domain. */
export function inputFromFloor(p: readonly [number, number]): readonly [number, number] {
  return [p[0], p[1] - FLOOR_CY];
}
