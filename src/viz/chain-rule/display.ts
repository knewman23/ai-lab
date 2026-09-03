import type { Composition } from "../../core/math/compositions";
import { FACE } from "../../core/math/compositions";
import type { Vec2 } from "../../core/math/numeric";

/** Half-edge of a face: the display extent of u and y on either side of their axes. */
export const HALF = FACE / 2;
/** Half-extents of every face box, in centred face-local coordinates. */
export const BOUND: readonly [number, number] = [HALF, HALF];

/** Centred face-local (a, b) of the front wall point (x, u): a = x, b = su·u. */
export function frontLocal(c: Composition, x: number, u: number): Vec2 {
  return [x, c.su * u];
}

/** Centred face-local (a, b) of the side wall point (u, y): a = sy·y in depth, b = su·u in height. */
export function sideLocal(c: Composition, u: number, y: number): Vec2 {
  return [c.sy * y, c.su * u];
}

/** Centred face-local (a, b) of the floor point (x, y): a = x, b = sy·y. */
export function floorLocal(c: Composition, x: number, y: number): Vec2 {
  return [x, c.sy * y];
}
