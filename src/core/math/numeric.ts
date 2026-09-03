/** A point or vector in the plane. */
export type Vec2 = readonly [number, number];

/**
 * Central-difference approximation of the gradient of `f` at (x, y).
 * Used to verify each surface's analytic gradient in tests.
 */
export function centralDifference(
  f: (x: number, y: number) => number,
  x: number,
  y: number,
  h = 1e-5,
): Vec2 {
  const fx = (f(x + h, y) - f(x - h, y)) / (2 * h);
  const fy = (f(x, y + h) - f(x, y - h)) / (2 * h);
  return [fx, fy];
}

/** True when both components of the point are finite (not NaN or ±Infinity). */
export function isFinitePoint(p: Vec2): boolean {
  return Number.isFinite(p[0]) && Number.isFinite(p[1]);
}

/** Euclidean norm of a 2-vector. */
export function magnitude(v: Vec2): number {
  return Math.hypot(v[0], v[1]);
}
