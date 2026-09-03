import type { Framing } from "../shared/framing";

/** Centre of the drawn Z range: the camera's target, and the click plane's centre. */
export const CENTRE_Z = -2.75;

const HALF_HEIGHT = 5.75;
const MARGIN = 1.15;
const DISTANCE = (HALF_HEIGHT / Math.tan(Math.PI / 8)) * MARGIN;

/**
 * The scene's home camera. Everything lies in the plane y = 0, so unlike the
 * surface scenes there is nothing to look "down" at: the camera sits straight
 * out on the -y side, level with the middle of the drawn Z range.
 *
 * The half-height covered is 5.75 (Z from -8.5 to 3.0 about the target's
 * -2.75); dividing by tan(fov / 2) for the kit's 45 degree camera gives the
 * distance that just fits it, and 1.15 leaves a margin.
 */
export function frameVertical(): Framing {
  return { position: [0, -DISTANCE, CENTRE_Z], target: [0, 0, CENTRE_Z] };
}
