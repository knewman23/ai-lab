import { Group } from "three";
import type { Fn1D } from "../../core/math/functions1d";
import { curveSamples, primeSamples, zoomSamples } from "../../core/math/sampling1d";
import type { ThemeColors } from "../types";
import { commit, disposeLayers, lineLayer } from "../shared/layer";
import { writeClippedPolyline, writePoints, writePolyline } from "../shared/layer-write";
import { CLIP } from "./clip";

export interface Curves {
  readonly group: Group;
  /** Draws the domain curve and the derivative runs for a function; clears any zoom. */
  setFunction(fn: Fn1D): void;
  /** K = 1 restores the domain curve; K > 1 swaps in the zoom window. */
  setZoom(fn: Fn1D, x: number, K: number): void;
  setShow(show: { derivative: boolean; guides: boolean }): void;
  /** markerZ null means f' is undefined here, so there is nothing to guide to. */
  setGuides(px: number, pz: number, markerZ: number | null): void;
  dispose(): void;
}

/** 241 samples make 240 segments, and a LineSegments endpoint pair per segment. */
const SAMPLES = 241;
const CURVE_ENDPOINTS = (SAMPLES - 1) * 2;
/**
 * A split into runs drops the sample at the singularity, so the runs together
 * never need more endpoints than the unsplit curve plus one pair of slack.
 */
const RUN_ENDPOINTS = CURVE_ENDPOINTS + 2;
/** Half-width of the short horizontal tick drawn at the marker's height. */
const GUIDE_TICK = 0.15;
const GUIDE_OPACITY = 0.6;
const PRIME_ORDER = 2;
const MAIN_ORDER = 3;
const GUIDE_ORDER = 6;

/**
 * The two sampled curves and the guides that tie them together: the function
 * over the domain (or over a zoom window), its derivative in the band below,
 * and a vertical from the point down to the derivative marker.
 *
 * The domain curve is kept in a cache buffer so leaving zoom is a copy rather
 * than a resample, and every layer draws from a buffer sized for the worst case
 * with `setDrawRange` deciding how much of it is live. `setZoom` is called every
 * frame of a drag, almost always at K = 1, so it memoises on (fn, x, K) and does
 * nothing at all unless one of them moved.
 */
export function createCurves(theme: ThemeColors): Curves {
  const prime = lineLayer(RUN_ENDPOINTS, PRIME_ORDER);
  const main = lineLayer(CURVE_ENDPOINTS, MAIN_ORDER);
  const guides = lineLayer(4, GUIDE_ORDER);
  guides.material.opacity = GUIDE_OPACITY;

  const group = new Group();
  group.add(prime.object, main.object, guides.object);

  // The domain curve, held aside so setZoom(K = 1) restores it without resampling.
  const domainPositions = new Float32Array(CURVE_ENDPOINTS * 3);
  let domainEndpoints = 0;

  let zoomed = false;
  // Last (fn, x, K) drawn, so the per-frame setZoom during a drag is a no-op.
  let lastFn: Fn1D | null = null;
  let lastX = Number.NaN;
  let lastK = Number.NaN;
  let showDerivative = true;
  let showGuides = true;
  let hasMarker = false;

  function applyTheme(): void {
    main.material.color.copy(theme.ink);
    prime.material.color.copy(theme.soft);
    guides.material.color.copy(theme.faint);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  /**
   * The band and the guides both belong to the un-zoomed reading of the scene,
   * and a guide that runs down to a hidden derivative curve points at nothing,
   * so the guides follow the derivative toggle as well as their own.
   */
  function applyVisibility(): void {
    prime.object.visible = showDerivative && !zoomed;
    guides.object.visible = showGuides && showDerivative && hasMarker && !zoomed;
  }

  function restoreDomainCurve(): void {
    main.positions.set(domainPositions);
    commit(main, domainEndpoints);
  }

  return {
    group,

    setFunction(fn: Fn1D): void {
      const { X, Z } = curveSamples(fn, SAMPLES);
      domainEndpoints = writePolyline(domainPositions, X, Z);
      restoreDomainCurve();

      // Runs are drawn into one buffer: LineSegments leaves the gap between
      // them, which is exactly what a jump or a vertical tangent should show.
      let n = 0;
      for (const run of primeSamples(fn, SAMPLES)) {
        n = writePolyline(prime.positions, run.X, run.Z, n);
      }
      commit(prime, n);

      zoomed = false;
      // A new curve invalidates whatever the zoom memo last drew.
      lastFn = null;
      applyVisibility();
    },

    setZoom(fn: Fn1D, x: number, K: number): void {
      if (fn === lastFn && x === lastX && K === lastK) return;
      lastFn = fn;
      lastX = x;
      lastK = K;

      if (K > 1) {
        const { X, Z } = zoomSamples(fn, x, K, SAMPLES);
        // Clipped so a steep window stops at the separator rather than running
        // down through the derivative band.
        writeClippedPolyline(main, X, Z, CLIP);
        zoomed = true;
      } else {
        // At K = 1 the curve is already the domain one unless we are leaving
        // zoom, so the common case (a drag, which never zooms) copies nothing.
        if (zoomed) restoreDomainCurve();
        zoomed = false;
      }
      applyVisibility();
    },

    setShow(show: { derivative: boolean; guides: boolean }): void {
      showDerivative = show.derivative;
      showGuides = show.guides;
      applyVisibility();
    },

    setGuides(px: number, pz: number, markerZ: number | null): void {
      hasMarker = markerZ !== null;
      if (markerZ !== null) {
        writePoints(guides, [
          [px, pz],
          [px, markerZ],
          [px - GUIDE_TICK, markerZ],
          [px + GUIDE_TICK, markerZ],
        ]);
      }
      applyVisibility();
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      disposeLayers([prime, main, guides]);
    },
  };
}
