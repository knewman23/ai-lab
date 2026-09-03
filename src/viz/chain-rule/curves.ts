import { Group } from "three";
import { type Composition, DOMAIN } from "../../core/math/compositions";
import type { Vec2 } from "../../core/math/numeric";
import { sampleOn } from "../../core/math/sampling1d";
import type { ThemeColors } from "../types";
import { disposeLayers, FACES, type Layer, lineLayer } from "../shared/layer";
import { writeClippedPolyline } from "../shared/layer-write";
import { BOUND, floorLocal, frontLocal, HALF, sideLocal } from "./display";

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
/** Face-local (a, b) of the pairs (T[i], V[i]) under `local`, as two arrays; NaN passes through. */
function localArrays(
  T: Float32Array,
  V: Float32Array,
  local: (t: number, v: number) => Vec2,
): [Float32Array, Float32Array] {
  const A = new Float32Array(T.length);
  const B = new Float32Array(T.length);
  for (let i = 0; i < T.length; i++) [A[i], B[i]] = local(T[i]!, V[i]!);
  return [A, B];
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

      // Front wall: u = g(x) over the domain.
      const inner = sampleOn(c.g, DOMAIN, SAMPLES);
      writeClippedPolyline(
        front,
        ...localArrays(inner.T, inner.V, (x, u) => frontLocal(c, x, u)),
        BOUND,
      );

      // Side wall: y = f(u) over the u range the wall spans.
      const outer = sampleOn(c.f, [-HALF / c.su, HALF / c.su], SAMPLES);
      writeClippedPolyline(
        side,
        ...localArrays(outer.T, outer.V, (u, y) => sideLocal(c, u, y)),
        BOUND,
      );

      // Floor: the composite y = f(g(x)) over the domain.
      const composite = sampleOn((x) => c.f(c.g(x)), DOMAIN, SAMPLES);
      writeClippedPolyline(
        floor,
        ...localArrays(composite.T, composite.V, (x, y) => floorLocal(c, x, y)),
        BOUND,
      );
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
