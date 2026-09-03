import { clipSegment } from "../../core/math/matrix2";
import { commit, type Layer, type Vec3 } from "./layer";

/**
 * Appends a sampled polyline to a buffer as consecutive segments, starting at
 * endpoint `start`; returns the endpoint count after it. Successive calls build
 * one buffer out of several runs, which LineSegments then draws with gaps
 * between them. Writes (X, 0, Z), so this is for flat layers only.
 */
export function writePolyline(
  positions: Float32Array,
  X: Float32Array,
  Z: Float32Array,
  start = 0,
): number {
  let n = start;
  for (let i = 0; i + 1 < X.length; i++) {
    for (const j of [i, i + 1]) {
      positions[n * 3] = X[j]!;
      positions[n * 3 + 2] = Z[j]!;
      n++;
    }
  }
  return n;
}

/**
 * Writes endpoint `n` of a layer from face-local (a, b): on a face, world is
 * `centre + (a, b)` along the face's axes with the fixed axis lifted off it;
 * on a flat layer, (a, 0, b).
 */
function setEndpoint(layer: Layer, n: number, a: number, b: number): void {
  if (import.meta.env.DEV && layer.kind === "world") {
    throw new Error("face-local write into a world layer; use writeWorldSegments");
  }
  const at = n * 3;
  const { face } = layer;
  if (face === undefined) {
    layer.positions[at] = a;
    layer.positions[at + 2] = b;
    return;
  }
  layer.positions[at + face.axes[0]] = face.centre[0] + a;
  layer.positions[at + face.axes[1]] = face.centre[1] + b;
  layer.positions[at + face.fixedAxis] = face.offset + face.lift;
}

/** A clipped segment shorter than this has collapsed to a point. */
const SEGMENT_EPS = 1e-9;

/**
 * Writes a sampled polyline clipped segment by segment to `bound` (half-extents
 * about the face-local origin), compacting the survivors forward, and publishes
 * them. Segments the clip drops, and segments with a non-finite endpoint, leave
 * gaps rather than shifting the curve.
 */
export function writeClippedPolyline(
  layer: Layer,
  A: Float32Array,
  B: Float32Array,
  bound: readonly [number, number],
): void {
  // Scratch endpoints, so the loop allocates no input of its own; clipSegment
  // still returns a fresh pair for each segment it keeps.
  const from: [number, number] = [0, 0];
  const to: [number, number] = [0, 0];
  let n = 0;
  for (let i = 0; i + 1 < A.length; i++) {
    from[0] = A[i]!;
    from[1] = B[i]!;
    to[0] = A[i + 1]!;
    to[1] = B[i + 1]!;
    if (
      !Number.isFinite(from[0]) ||
      !Number.isFinite(from[1]) ||
      !Number.isFinite(to[0]) ||
      !Number.isFinite(to[1])
    ) {
      continue;
    }
    const clipped = clipSegment(from, to, bound);
    if (clipped === null) continue;
    const [p, q] = clipped;
    if (Math.abs(q[0] - p[0]) < SEGMENT_EPS && Math.abs(q[1] - p[1]) < SEGMENT_EPS) continue;
    for (const point of clipped) {
      setEndpoint(layer, n, point[0], point[1]);
      n++;
    }
  }
  commit(layer, n);
}

/** Writes face-local (a, b) endpoint pairs into a layer's buffer and publishes them. */
export function writePoints(layer: Layer, points: readonly (readonly [number, number])[]): void {
  for (let i = 0; i < points.length; i++) {
    setEndpoint(layer, i, points[i]![0], points[i]![1]);
  }
  commit(layer, points.length);
}

/** Writes world-space segments verbatim into a `{ depth: true }` layer and publishes them. */
export function writeWorldSegments(
  layer: Layer,
  segments: readonly (readonly [Vec3, Vec3])[],
): void {
  if (import.meta.env.DEV && layer.kind !== "world") {
    throw new Error(`world write into a ${layer.kind} layer; create it with { depth: true }`);
  }
  let n = 0;
  for (const segment of segments) {
    for (const point of segment) {
      layer.positions.set(point, n * 3);
      n++;
    }
  }
  commit(layer, n);
}
