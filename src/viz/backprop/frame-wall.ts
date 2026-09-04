import type { Framing } from "../shared/framing";

/** The camera's target: the centre of the wall, x = 0, z = 3. */
const TARGET: readonly [number, number, number] = [0, 0, 3];
/** Direction from the target to the camera, in units of `SCALE`. */
const OFFSET: readonly [number, number, number] = [0.8, -1.05, 0.5];
const SCALE = 12;

/**
 * The scene's home camera. It looks at the 10x6 wall (y = 0) from the -y side,
 * about 35 degrees to the right of face-on and 30 degrees above, so the value
 * and gradient bars along +-y read as lengths rather than dots while the graph
 * on the wall stays legible. (Tuned in the browser check: the spec's 0.55 x
 * offset was too face-on, 1.15 too oblique.)
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
