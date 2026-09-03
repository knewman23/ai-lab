import { FACES, type Vec3 } from "../shared/layer";

/** A world-space segment. */
export type Segment = readonly [Vec3, Vec3];

/** Half-length of a unit tick. */
export const TICK = 0.12;

/** Distance each line sits off its face along the interior normal, against z-fighting. */
const LIFT = FACES.front.lift;

/** Lift along each face's interior normal: front +y, side +x, floor +z. */
const LIFT_FRONT: Vec3 = [0, LIFT, 0];
const LIFT_SIDE: Vec3 = [LIFT, 0, 0];
const LIFT_FLOOR: Vec3 = [0, 0, LIFT];

function add(...vs: readonly Vec3[]): Vec3 {
  return vs.reduce<Vec3>((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0]);
}

/** A segment from `a` to `b`, lifted by every vector in `lifts`. */
function segment(a: Vec3, b: Vec3, ...lifts: readonly Vec3[]): Segment {
  return [add(a, ...lifts), add(b, ...lifts)];
}

/**
 * The nine edges of the box x in [-3, 3], y in [0, 6], z in [0, 6] that lie on
 * its three drawn faces. An edge shared by two faces is lifted along both
 * interior normals.
 */
export function outlineSegments(): Segment[] {
  return [
    // The three edges meeting at the vertex (-3, 0, 0), each on two faces.
    segment([-3, 0, 0], [3, 0, 0], LIFT_FRONT, LIFT_FLOOR),
    segment([-3, 0, 0], [-3, 6, 0], LIFT_SIDE, LIFT_FLOOR),
    segment([-3, 0, 0], [-3, 0, 6], LIFT_FRONT, LIFT_SIDE),
    // Front wall: top and right.
    segment([-3, 0, 6], [3, 0, 6], LIFT_FRONT),
    segment([3, 0, 0], [3, 0, 6], LIFT_FRONT),
    // Side wall: top and back.
    segment([-3, 0, 6], [-3, 6, 6], LIFT_SIDE),
    segment([-3, 6, 0], [-3, 6, 6], LIFT_SIDE),
    // Floor: right and back.
    segment([3, 0, 0], [3, 6, 0], LIFT_FLOOR),
    segment([-3, 6, 0], [3, 6, 0], LIFT_FLOOR),
  ];
}

/**
 * The axes drawn across the faces and the unit ticks on the two x axes. The
 * shared vertical edge at (x, y) = (-3, 0) is already an outline edge. The u
 * and y axes carry no ticks: their display scales change per preset.
 */
export function axisSegments(): Segment[] {
  const segments: Segment[] = [
    // Front wall x axis (u = 0) and side wall y axis (u = 0).
    segment([-3, 0, 3], [3, 0, 3], LIFT_FRONT),
    segment([-3, 0, 3], [-3, 6, 3], LIFT_SIDE),
    // Floor x axis (y = 0) and y axis (x = -3).
    segment([-3, 3, 0], [3, 3, 0], LIFT_FLOOR),
    segment([-3, 0, 0], [-3, 6, 0], LIFT_FLOOR, LIFT_SIDE),
  ];
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    segments.push(
      segment([i, 0, 3 - TICK], [i, 0, 3 + TICK], LIFT_FRONT),
      segment([i, 3 - TICK, 0], [i, 3 + TICK, 0], LIFT_FLOOR),
    );
  }
  return segments;
}
