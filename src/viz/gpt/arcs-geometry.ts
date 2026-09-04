/**
 * The shape of one attention ribbon: a quadratic Bézier from the key column to the query
 * column, widened into a triangle strip. Pure — nothing here imports Three.js beyond the layer
 * module's plain point and segment types, so the winding every vertex is emitted in can be
 * tested without a renderer. That matters more here than anywhere else in the scene: WebGPU's
 * `DoubleSide` path multiplies the normal by `faceDirection`, so a back-wound triangle lights
 * itself inside out and the fix is never to negate a normal but to emit the strip consistently.
 */

import type { Segment, Vec3 } from "../shared/layer";
import { BAND_Z, columnX, COLUMN_X } from "./layout";

/** How many straight pieces one Bézier is sampled into; the stations are one more than this. */
export const ARC_SEGMENTS = 24;

/**
 * How far in front of the wall the ribbons float. Deeper than the bands' 0.01 and the columns'
 * 0.02, so an arc passing over a band line or a glyph never z-fights with it.
 */
export const ARC_LIFT = -0.06;

/** Two triangles, three vertices each, per segment. */
export const ARC_VERTICES = ARC_SEGMENTS * 6;

/** One arc per sequence position at most: a query reads every key up to and including itself. */
export const MAX_ARCS = COLUMN_X.length;

/** Floats the ribbon mesh preallocates. A multiple of 3, or `computeBoundingSphere` reads past it. */
export const ARC_BUFFER_FLOATS = MAX_ARCS * ARC_VERTICES * 3;

/** Half-width of a ribbon carrying no weight at all, and how much a weight of 1 adds to it. */
const HALF_WIDTH_BASE = 0.01;
const HALF_WIDTH_GAIN = 0.075;

/** Height of the control point over the attention band, and how much each unit of reach adds. */
const CONTROL_LIFT_BASE = 0.25;
const CONTROL_LIFT_GAIN = 0.35;

/** Arm length of a masked position's `×`, in either direction along both diagonals. */
const CROSS_ARM = 0.07;

/**
 * How thick a ribbon carrying `weight` is drawn, measured from its centre line. The base keeps a
 * near-zero weight a visible hairline rather than nothing, so "this key is read faintly" and
 * "this key is not read" stay different pictures.
 */
export function arcHalfWidth(weight: number): number {
  return HALF_WIDTH_BASE + HALF_WIDTH_GAIN * weight;
}

/**
 * The Bézier control point for an arc between two columns: over their midpoint, lifted with the
 * distance between them, so a long reach bows higher and does not lie on top of a short one.
 */
export function arcControl(from: number, to: number): Vec3 {
  const a = columnX(from);
  const b = columnX(to);
  const lift = CONTROL_LIFT_BASE + CONTROL_LIFT_GAIN * Math.abs(b - a);
  return [(a + b) / 2, ARC_LIFT, BAND_Z.attention + lift];
}

/** Where an arc begins and ends: its column's point on the attention band, at the arcs' lift. */
function endpoint(i: number): Vec3 {
  return [columnX(i), ARC_LIFT, BAND_Z.attention];
}

/**
 * The arc's centre line, `ARC_SEGMENTS + 1` stations from the key column to the query column.
 * The first and last stations are the endpoints exactly — at t = 0 and t = 1 the Bézier's other
 * two terms carry a factor of zero — so a ribbon always meets the columns it joins.
 */
export function arcCentreLine(from: number, to: number): Vec3[] {
  const a = endpoint(from);
  const b = endpoint(to);
  const c = arcControl(from, to);
  const points: Vec3[] = [];
  for (let s = 0; s <= ARC_SEGMENTS; s++) {
    const t = s / ARC_SEGMENTS;
    const u = 1 - t;
    points.push([
      u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
      ARC_LIFT,
      u * u * a[2] + 2 * u * t * c[2] + t * t * b[2],
    ]);
  }
  return points;
}

/**
 * The offset from the centre line to the ribbon's rim at one station: the tangent turned a
 * quarter turn, scaled to the half-width. Always the same turn, never the reverse, which is what
 * makes every triangle below wind the same way whichever direction the arc runs.
 *
 * A self-arc — a query reading its own position — doubles back on itself, and its tangent is
 * exactly zero at the apex. There the ribbon pinches to nothing, so the fold contributes
 * zero-area triangles instead of back-wound ones.
 */
function rim(tx: number, tz: number, halfWidth: number): Vec3 {
  const length = Math.hypot(tx, tz);
  if (!(length > 0)) return [0, 0, 0];
  return [(halfWidth * tz) / length, 0, (-halfWidth * tx) / length];
}

/** The Bézier's derivative at `t`, as (x, z); the curve is flat in y. */
function tangent(a: Vec3, c: Vec3, b: Vec3, t: number): readonly [number, number] {
  const u = 1 - t;
  return [
    2 * u * (c[0] - a[0]) + 2 * t * (b[0] - c[0]),
    2 * u * (c[2] - a[2]) + 2 * t * (b[2] - c[2]),
  ];
}

/**
 * One ribbon as a triangle list, built strip-wise: two triangles per segment, sharing the rim
 * points of the stations they span. Vertices come out in the order (near, far, near-next),
 * (far, far-next, near-next) at every segment, which winds all of them the same way.
 */
export function arcTriangles(from: number, to: number, halfWidth: number): Vec3[] {
  const a = endpoint(from);
  const b = endpoint(to);
  const c = arcControl(from, to);
  const line = arcCentreLine(from, to);

  const near: Vec3[] = [];
  const far: Vec3[] = [];
  for (let s = 0; s < line.length; s++) {
    const p = line[s];
    if (p === undefined) throw new Error(`gpt arcs: the centre line has no station ${s}`);
    const [tx, tz] = tangent(a, c, b, s / ARC_SEGMENTS);
    const offset = rim(tx, tz, halfWidth);
    near.push([p[0] + offset[0], ARC_LIFT, p[2] + offset[2]]);
    far.push([p[0] - offset[0], ARC_LIFT, p[2] - offset[2]]);
  }

  const vertices: Vec3[] = [];
  for (let s = 0; s + 1 < line.length; s++) {
    const [n0, n1, f0, f1] = [near[s], near[s + 1], far[s], far[s + 1]];
    if (n0 === undefined || n1 === undefined || f0 === undefined || f1 === undefined) {
      throw new Error(`gpt arcs: the ribbon has no rim at segment ${s}`);
    }
    vertices.push(n0, f0, n1, f0, f1, n1);
  }
  return vertices;
}

/**
 * Writes one ribbon per half-width into `out`, key column `j` first, and collapses the rest of
 * the buffer to zero so a shorter row never leaves the previous frame's arcs behind. Returns the
 * vertex count the mesh should draw.
 */
export function writeArcs(out: Float32Array, query: number, halfWidths: readonly number[]): number {
  if (halfWidths.length > MAX_ARCS) {
    throw new Error(`gpt arcs: ${halfWidths.length} keys exceed the ${MAX_ARCS} columns`);
  }
  let n = 0;
  for (let j = 0; j < halfWidths.length; j++) {
    const halfWidth = halfWidths[j];
    if (halfWidth === undefined) throw new Error(`gpt arcs: no half-width for key ${j}`);
    for (const vertex of arcTriangles(j, query, halfWidth)) {
      out.set(vertex, n * 3);
      n++;
    }
  }
  out.fill(0, n * 3);
  return n;
}

/** The `×` that marks a key the causal mask hides: two strokes crossing on the attention band. */
export function crossSegments(j: number): Segment[] {
  const x = columnX(j);
  const z = BAND_Z.attention;
  return [
    [
      [x - CROSS_ARM, ARC_LIFT, z - CROSS_ARM],
      [x + CROSS_ARM, ARC_LIFT, z + CROSS_ARM],
    ],
    [
      [x - CROSS_ARM, ARC_LIFT, z + CROSS_ARM],
      [x + CROSS_ARM, ARC_LIFT, z - CROSS_ARM],
    ],
  ];
}
