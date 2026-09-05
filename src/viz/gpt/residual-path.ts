/**
 * The selected token's vector, moving through embedding space on the floor: embedding → x →
 * xResid → xFinal, as three chained arrows with a ring on the end. This is what ties the two
 * surfaces together — the wall shows the pipeline's shape, this shows the same token's vector
 * actually travelling toward whichever word comes next.
 */

import { Group } from "three";
import type { Vec2 } from "../../core/math/numeric";
import type { Forward } from "../../core/math/transformer";
import { disposeLayers, type Layer, lineLayer, type Segment, type Vec3 } from "../shared/layer";
import { writeWorldSegments } from "../shared/layer-write";
import type { ThemeColors } from "../types";
import { floorFromEmbed } from "./layout";

/** The three steps, in the order they are chained; the labels are §5.7's. */
export const STEP_LABELS = ["+ position", "+ attention", "+ MLP"] as const;

/** One layer per step, plus the ring that marks where the token ends up. */
export type StepKey = "position" | "attention" | "mlp";
type PathKey = StepKey | "ring";

export interface ResidualPath {
  readonly group: Group;
  readonly layers: Readonly<Record<PathKey, Layer>>;
  /** Redraws the chain for one sequence position. */
  set(f: Forward, query: number): void;
  setShow(on: boolean): void;
  dispose(): void;
}

/** Lift toward +z, the camera side of the floor, so the plane does not z-fight the path. */
const LIFT = 0.01;

/** The path sits above the floor's unembedding rays, and below nothing else on the floor. */
const ORDER = 3;

/**
 * Arrowhead barbs: a fraction of the shaft, but never longer than `HEAD_MAX`. Unlike the wall
 * glyphs, these arrows are drawn at true length and a long one would otherwise grow a head the
 * size of the step it is measuring.
 */
const HEAD_FRACTION = 0.32;
const HEAD_MAX = 0.18;
const HEAD_ANGLE = 0.42;

/** The ring that marks `xFinal`, and how many segments it is drawn in. */
const RING_RADIUS = 0.14;
const RING_SEGMENTS = 24;

/** Endpoints a step can need: shaft, two barbs, and the base joining them. */
const STEP_ENDPOINTS = 8;

const STEPS = ["position", "attention", "mlp"] as const satisfies readonly StepKey[];
const PATH_KEYS = [...STEPS, "ring"] as const satisfies readonly PathKey[];

/** Reads one 2-vector out of a pass. Throws rather than defaulting: a short row is a bug. */
function vectorAt(rows: readonly Float64Array[], i: number, field: string): Vec2 {
  const row = rows[i];
  if (row === undefined) throw new Error(`gpt residual path: no ${field} at position ${i}`);
  const [a, b] = row;
  if (a === undefined || b === undefined) {
    throw new Error(`gpt residual path: ${field} at position ${i} is not a 2-vector`);
  }
  return [a, b];
}

/**
 * The four floor points the chain runs through: the token's embedding, then the stream after
 * position, after attention and after the MLP. The embedding is `x − pe`, so every number here
 * comes from the forward pass rather than from a second reading of the state.
 */
export function pathPoints(f: Forward, query: number): Vec3[] {
  const x = vectorAt(f.x, query, "x");
  const pe = vectorAt(f.pe, query, "pe");
  const stages: Vec2[] = [
    [x[0] - pe[0], x[1] - pe[1]],
    x,
    vectorAt(f.xResid, query, "xResid"),
    vectorAt(f.xFinal, query, "xFinal"),
  ];
  return stages.map((e) => {
    const [px, py] = floorFromEmbed(e);
    return [px, py, LIFT];
  });
}

/**
 * One arrow on the floor, shaft first so a reader of the buffer can take segment 0 as the step's
 * whole reach. A step of zero length draws nothing rather than a degenerate spike — which is
 * what the position step does whenever positional encoding is switched off.
 */
export function arrowSegments(from: Vec3, to: Vec3): Segment[] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  // Also catches a NaN step, which must not reach the buffer: it would poison the layer's
  // bounding sphere and take the whole floor off screen.
  if (!(length > 0)) return [];

  const ux = dx / length;
  const uy = dy / length;
  const barb = Math.min(HEAD_MAX, HEAD_FRACTION * length);
  const ends: Vec3[] = [];
  for (const sign of [1, -1]) {
    const c = Math.cos(sign * HEAD_ANGLE);
    const s = Math.sin(sign * HEAD_ANGLE);
    // The shaft direction reversed, then rotated off the shaft by the head angle.
    ends.push([to[0] + barb * (-ux * c + uy * s), to[1] + barb * (-ux * s - uy * c), LIFT]);
  }
  const [first, second] = ends;
  if (first === undefined || second === undefined) {
    throw new Error("gpt residual path: an arrowhead needs both of its barbs");
  }
  return [
    [from, to],
    [to, first],
    [to, second],
    [first, second],
  ];
}

/** The hollow ring marking where the token ended up, as a closed polyline. */
export function ringSegments(at: Vec3): Segment[] {
  const point = (s: number): Vec3 => {
    const angle = (2 * Math.PI * s) / RING_SEGMENTS;
    return [at[0] + RING_RADIUS * Math.cos(angle), at[1] + RING_RADIUS * Math.sin(angle), LIFT];
  };
  const segments: Segment[] = [];
  for (let s = 0; s < RING_SEGMENTS; s++) segments.push([point(s), point(s + 1)]);
  return segments;
}

/**
 * The residual path: three arrows at **true relative length**, not normalised. The attention
 * step is usually the longer of the last two, but `|mlpOut| / |attnOut|` runs from 0.07 to 1.47
 * across the presets and sentences, so on `scrambled` the MLP step legitimately exceeds it.
 * That is data, not a layout failure.
 */
export function createResidualPath(theme: ThemeColors): ResidualPath {
  const layers = Object.fromEntries(
    PATH_KEYS.map((key) => [
      key,
      lineLayer(key === "ring" ? RING_SEGMENTS * 2 : STEP_ENDPOINTS, ORDER, { depth: true }),
    ]),
  ) as Record<PathKey, Layer>;

  const group = new Group();
  for (const key of PATH_KEYS) group.add(layers[key].object);

  function applyTheme(): void {
    layers.position.material.color.copy(theme.soft);
    layers.attention.material.color.copy(theme.accent);
    layers.mlp.material.color.copy(theme.ink);
    layers.ring.material.color.copy(theme.ink);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  return {
    group,
    layers,

    set(f, query): void {
      const points = pathPoints(f, query);
      for (let s = 0; s < STEPS.length; s++) {
        const from = points[s];
        const to = points[s + 1];
        const key = STEPS[s];
        if (from === undefined || to === undefined || key === undefined) {
          throw new Error(`gpt residual path: the chain has no step ${s}`);
        }
        // Through `commit`, so a zero-length step hides rather than drawing zero vertices.
        writeWorldSegments(layers[key], arrowSegments(from, to));
      }
      const end = points[STEPS.length];
      if (end === undefined) throw new Error("gpt residual path: the chain has no end point");
      writeWorldSegments(layers.ring, ringSegments(end));
    },

    setShow(on): void {
      group.visible = on;
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      disposeLayers(PATH_KEYS.map((key) => layers[key]));
    },
  };
}
