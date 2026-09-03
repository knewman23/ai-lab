import { Group } from "three";
import { type Composition, DOMAIN, FACE } from "../../core/math/compositions";
import { sampleOn } from "../../core/math/sampling1d";
import type { ThemeColors } from "../types";
import { disposeLayers, FACES, type Layer, lineLayer } from "../shared/layer";
import { writeClippedPolyline } from "../shared/layer-write";

export interface Curves {
  readonly group: Group;
  /** The face layers, keyed by face; read by tests. */
  readonly layers: { readonly front: Layer; readonly side: Layer; readonly floor: Layer };
  /** Redraws all three curves for a composition; a repeat of the last one is a no-op. */
  setComposition(c: Composition): void;
  dispose(): void;
}

/** 241 samples make 240 segments, and a LineSegments endpoint pair per segment. */
const SAMPLES = 241;
const CURVE_ENDPOINTS = (SAMPLES - 1) * 2;
/** Above the faces' outline and axes, below points and links. */
const CURVE_ORDER = 2;
/** Half-edge of a face: the display extent of u and y on either side of their axes. */
const HALF = FACE / 2;
/** Half-extents of every face, in centred face-local coordinates. */
const BOUND: readonly [number, number] = [HALF, HALF];

/** A copy of `values` with every entry multiplied by `scale`; NaN passes through. */
function scaled(values: Float32Array, scale: number): Float32Array {
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = scale * values[i]!;
  return out;
}

/**
 * The three curves of the chain rule scene, one per face: u = g(x) on the
 * front wall, y = f(u) on the side wall and the composite y = f(g(x)) on the
 * floor. Each is sampled evenly, scaled by the composition's display scales
 * into centred face-local coordinates and clipped to its face; the layer adds
 * the face centre and lift, and drops segments touching an undefined sample.
 */
export function createCurves(theme: ThemeColors): Curves {
  const front = lineLayer(CURVE_ENDPOINTS, CURVE_ORDER, { face: FACES.front });
  const side = lineLayer(CURVE_ENDPOINTS, CURVE_ORDER, { face: FACES.side });
  const floor = lineLayer(CURVE_ENDPOINTS, CURVE_ORDER, { face: FACES.floor });
  const layers = { front, side, floor };

  const group = new Group();
  group.add(front.object, side.object, floor.object);

  function applyTheme(): void {
    for (const layer of [front, side, floor]) layer.material.color.copy(theme.ink);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  let last: Composition | null = null;

  return {
    group,
    layers,

    setComposition(c: Composition): void {
      if (c === last) return;
      last = c;

      // Front wall: X = x, Z = HALF + su * g(x).
      const inner = sampleOn(c.g, DOMAIN, SAMPLES);
      writeClippedPolyline(front, inner.T, scaled(inner.V, c.su), BOUND);

      // Side wall: depth Y = HALF + sy * f(u), height Z = HALF + su * u, over
      // the u range the wall spans.
      const outer = sampleOn(c.f, [-HALF / c.su, HALF / c.su], SAMPLES);
      writeClippedPolyline(side, scaled(outer.V, c.sy), scaled(outer.T, c.su), BOUND);

      // Floor: X = x, Y = HALF + sy * f(g(x)).
      const composite = sampleOn((x) => c.f(c.g(x)), DOMAIN, SAMPLES);
      writeClippedPolyline(floor, composite.T, scaled(composite.V, c.sy), BOUND);
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      disposeLayers([front, side, floor]);
    },
  };
}
