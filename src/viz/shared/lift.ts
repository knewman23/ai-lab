import { type Face, FACES, type Segment, type Vec3 } from "./layer";

/** The vector that lifts a point off `face` along its interior normal: `face.lift` on the fixed axis. */
export function liftOf(face: Face): Vec3 {
  const v: [number, number, number] = [0, 0, 0];
  v[face.fixedAxis] = face.lift;
  return v;
}

/**
 * Where centred face-local (a, b) lands in the world: the face centre plus
 * (a, b) along `face.axes`, with the fixed axis lifted just off the face.
 * The one function every on-face point is placed with.
 */
export function faceToWorld(face: Face, a: number, b: number): Vec3 {
  const v: [number, number, number] = [0, 0, 0];
  v[face.axes[0]] = face.centre[0] + a;
  v[face.axes[1]] = face.centre[1] + b;
  v[face.fixedAxis] = face.offset + face.lift;
  return v;
}

/** Lift off the front wall (+y). */
export const LIFT_FRONT: Vec3 = liftOf(FACES.front);
/** Lift off the side wall (+x). */
export const LIFT_SIDE: Vec3 = liftOf(FACES.side);
/** Lift off the floor (+z). */
export const LIFT_FLOOR: Vec3 = liftOf(FACES.floor);

/** A segment from `a` to `b` with the sum of `lifts` added to both endpoints. */
export function segment(a: Vec3, b: Vec3, ...lifts: readonly Vec3[]): Segment {
  const [dx, dy, dz] = lifts.reduce<Vec3>(
    (acc, v) => [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]],
    [0, 0, 0],
  );
  return [
    [a[0] + dx, a[1] + dy, a[2] + dz],
    [b[0] + dx, b[1] + dy, b[2] + dz],
  ];
}
