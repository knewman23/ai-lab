import type { Framing } from "../shared/framing";

/**
 * The camera's target: the middle of the scene, between the floor (centred
 * y = −3.5) and the centre of the wall (y = 0, z = 3).
 */
const TARGET: readonly [number, number, number] = [0, -1.5, 2.5];
/** Direction from the target to the camera, in units of `SCALE`. */
const OFFSET: readonly [number, number, number] = [0.8, -1.1, 0.7];
const SCALE = 12;

/**
 * The scene's home camera. It looks at the network on the wall (y = 0) from the
 * −y side, with the floor lying between the camera and the wall, about 35
 * degrees to the right of face-on and 27 degrees above, so the floor reads as a
 * surface rather than a line while the network on the wall stays legible.
 * Tuned in the browser check.
 */
export function frameNn(): Framing {
  return {
    target: TARGET,
    position: [
      TARGET[0] + SCALE * OFFSET[0],
      TARGET[1] + SCALE * OFFSET[1],
      TARGET[2] + SCALE * OFFSET[2],
    ],
  };
}
