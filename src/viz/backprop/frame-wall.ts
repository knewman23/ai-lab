import type { Framing } from "../shared/framing";

/** The camera's target: the centre of the wall, x = 0, z = 3. */
const TARGET: readonly [number, number, number] = [0, 0, 3];
/** Direction from the target to the camera, in units of `SCALE`. */
const OFFSET: readonly [number, number, number] = [0.55, -1.05, 0.5];
const SCALE = 12;

/**
 * The scene's home camera. It looks at the 10x6 wall (y = 0) nearly face-on
 * from the +x, -y, +z octant: slightly to the right and above, so the value
 * and gradient bars standing off the wall along ±y read as lengths instead of
 * collapsing to points. Tuned in the browser check; the spec fixes the octant.
 */
export function frameWall(): Framing {
  return {
    target: TARGET,
    position: [
      TARGET[0] + SCALE * OFFSET[0],
      TARGET[1] + SCALE * OFFSET[1],
      TARGET[2] + SCALE * OFFSET[2],
    ],
  };
}
