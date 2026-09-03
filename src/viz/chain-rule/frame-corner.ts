import type { Framing } from "../shared/framing";

/** The camera's target: the centre of the front wall, x = 0, u = 0. */
const TARGET: readonly [number, number, number] = [0, 3, 3];
/** Direction from the target to the camera, in units of `SCALE`. */
const OFFSET: readonly [number, number, number] = [-1.5, -1.6, 1.3];
const SCALE = 6.5;

/**
 * The scene's home camera. It looks at the 6x6x6 corner from the -x, -y, +z
 * octant, i.e. from outside the corner's vertex: the side wall (x = -3) fans
 * out to the left of the shared vertical edge and the front wall (y = 0) to the
 * right, so the two walls never overlap on screen, x still increases to the
 * right on the front wall, and the floor is seen from about 30 degrees above
 * between them. Both walls are seen through their translucent faces. (A camera
 * on the +x side, tried first, stacked the side wall behind the front wall.)
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
