import type { Framing } from "../shared/framing";

/** The camera's target: the centre of the front wall, x = 0, u = 0. */
const TARGET: readonly [number, number, number] = [0, 3, 3];
/** Direction from the target to the camera, in units of `SCALE`. */
const OFFSET: readonly [number, number, number] = [1.35, -1.6, 0.9];
const SCALE = 6.5;

/**
 * The scene's home camera. It looks at the 6x6x6 corner from the +x, -y, +z
 * octant: the front wall (y = 0) nearly face-on, seen through its translucent
 * face from the -y side; the side wall (x = -3) shows its inner face at about
 * 40 degrees; the floor (z = 0) is seen from about 35 degrees above. That puts
 * all three faces, and the curve on each, in view at once.
 */
export function frameCorner(): Framing {
  return {
    target: TARGET,
    position: [
      TARGET[0] + SCALE * OFFSET[0],
      TARGET[1] + SCALE * OFFSET[1],
      TARGET[2] + SCALE * OFFSET[2],
    ],
  };
}
