import type { Framing } from "../shared/framing";

/**
 * The camera's target: between the centre of the wall (y = 0, z = 2.6) and the floor's near
 * edge (y = −6, z = 0), so both surfaces sit inside the frame rather than one filling it.
 */
const TARGET: readonly [number, number, number] = [0, -2.2, 1.6];
/** Direction from the target to the camera, in units of `SCALE`. */
const OFFSET: readonly [number, number, number] = [0.35, -1.15, 0.55];
const SCALE = 8;

/**
 * The scene's home camera, reused by Reset view. It looks at the wall (y = 0) from the −y side
 * with the floor between, about 17 degrees off face-on and 25 degrees above: near-frontal enough
 * that the attention arcs and the token columns stay legible, oblique enough that the eight
 * embedding points separate on the floor.
 */
export function frameGpt(): Framing {
  return {
    target: TARGET,
    position: [
      TARGET[0] + SCALE * OFFSET[0],
      TARGET[1] + SCALE * OFFSET[1],
      TARGET[2] + SCALE * OFFSET[2],
    ],
  };
}
