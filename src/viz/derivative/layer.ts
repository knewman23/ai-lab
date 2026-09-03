import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from "three";
import { clipSegment } from "../../core/math/matrix2";

/** A flat line layer and the buffer it draws from. */
export interface Layer {
  readonly object: LineSegments;
  readonly geometry: BufferGeometry;
  readonly material: LineBasicMaterial;
  /** (X, 0, Z) per endpoint; `setDrawRange` decides how much of it is live. */
  readonly positions: Float32Array;
}

/**
 * The display box every line in the scene is clipped to: the tangent, the
 * secant and the zoomed curve all stop here, clear of the derivative band.
 */
export const CLIP: readonly [number, number] = [3.5, 3.4];

/**
 * One coplanar line layer over a preallocated buffer of `endpoints` vertices,
 * drawn as LineSegments so a curve can have gaps in it.
 *
 * Everything in this scene lies in the plane y = 0 and is drawn as a stack of
 * flat layers, so depth testing is off and `renderOrder` alone decides what
 * sits above what.
 */
export function lineLayer(endpoints: number, renderOrder: number): Layer {
  const positions = new Float32Array(endpoints * 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);
  const material = new LineBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const object = new LineSegments(geometry, material);
  object.renderOrder = renderOrder;
  return { object, geometry, material, positions };
}

/** Publishes the first `endpoints` vertices of a layer's buffer. */
export function commit(layer: Layer, endpoints: number): void {
  layer.geometry.getAttribute("position").needsUpdate = true;
  layer.geometry.setDrawRange(0, endpoints);
  layer.geometry.computeBoundingSphere();
}

/**
 * Appends a sampled polyline to a buffer as consecutive segments, starting at
 * endpoint `start`; returns the endpoint count after it. Successive calls build
 * one buffer out of several runs, which LineSegments then draws with gaps
 * between them.
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

/** A clipped segment shorter than this has collapsed to a point. */
const SEGMENT_EPS = 1e-9;

/**
 * Writes a sampled polyline clipped segment by segment to `bound`, compacting
 * the survivors forward, and publishes them. Segments the clip drops leave gaps
 * rather than shifting the curve.
 */
export function writeClippedPolyline(
  layer: Layer,
  X: Float32Array,
  Z: Float32Array,
  bound: readonly [number, number],
): void {
  // Scratch endpoints, so the loop allocates no input of its own; clipSegment
  // still returns a fresh pair for each segment it keeps.
  const from: [number, number] = [0, 0];
  const to: [number, number] = [0, 0];
  let n = 0;
  for (let i = 0; i + 1 < X.length; i++) {
    from[0] = X[i]!;
    from[1] = Z[i]!;
    to[0] = X[i + 1]!;
    to[1] = Z[i + 1]!;
    const clipped = clipSegment(from, to, bound);
    if (clipped === null) continue;
    const [a, b] = clipped;
    if (Math.abs(b[0] - a[0]) < SEGMENT_EPS && Math.abs(b[1] - a[1]) < SEGMENT_EPS) continue;
    for (const point of clipped) {
      layer.positions[n * 3] = point[0];
      layer.positions[n * 3 + 2] = point[1];
      n++;
    }
  }
  commit(layer, n);
}

/** Writes (X, Z) endpoint pairs into a layer's buffer and publishes them. */
export function writePoints(layer: Layer, points: readonly (readonly [number, number])[]): void {
  for (let i = 0; i < points.length; i++) {
    layer.positions[i * 3] = points[i]![0];
    layer.positions[i * 3 + 2] = points[i]![1];
  }
  commit(layer, points.length);
}

/** Releases a layer's GPU resources. */
export function disposeLayers(layers: readonly Layer[]): void {
  for (const layer of layers) {
    layer.geometry.dispose();
    layer.material.dispose();
  }
}
