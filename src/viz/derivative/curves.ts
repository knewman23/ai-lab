import { BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineSegments } from "three";
import type { Fn1D } from "../../core/math/functions1d";
import { clipSegment } from "../../core/math/matrix2";
import { curveSamples, primeSamples, zoomSamples } from "../../core/math/sampling1d";
import type { ThemeColors } from "../types";

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
/** The display box the zoomed curve is clipped to; the lines use the same one. */
const CLIP: readonly [number, number] = [3.5, 3.4];
/** Half-width of the short horizontal tick drawn at the marker's height. */
const GUIDE_TICK = 0.15;
const GUIDE_OPACITY = 0.6;
const PRIME_ORDER = 2;
const MAIN_ORDER = 3;
const GUIDE_ORDER = 6;
/** A clipped segment shorter than this has collapsed to a point. */
const SEGMENT_EPS = 1e-9;

interface Layer {
  readonly object: LineSegments;
  readonly geometry: BufferGeometry;
  readonly material: LineBasicMaterial;
  readonly positions: Float32Array;
}

/** One flat line layer over a preallocated buffer of `endpoints` (X, 0, Z) vertices. */
function lineLayer(endpoints: number, renderOrder: number): Layer {
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

/**
 * Appends a sampled polyline as consecutive segments, starting at endpoint
 * `start`; returns the endpoint count after it.
 */
function writePolyline(
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

function commit(layer: Layer, endpoints: number): void {
  layer.geometry.getAttribute("position").needsUpdate = true;
  layer.geometry.setDrawRange(0, endpoints);
  layer.geometry.computeBoundingSphere();
}

/**
 * The two sampled curves and the guides that tie them together: the function
 * over the domain (or over a zoom window), its derivative in the band below,
 * and a vertical from the point down to the derivative marker.
 *
 * The domain curve is kept in a cache buffer so leaving zoom is a copy rather
 * than a resample, and every layer draws from a buffer sized for the worst case
 * with `setDrawRange` deciding how much of it is live.
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

  /** The band and the guides both belong to the un-zoomed reading of the scene. */
  function applyVisibility(): void {
    prime.object.visible = showDerivative && !zoomed;
    guides.object.visible = showGuides && hasMarker && !zoomed;
  }

  function restoreDomainCurve(): void {
    main.positions.set(domainPositions);
    commit(main, domainEndpoints);
  }

  /** Writes the zoom window, clipped segment by segment to the display box. */
  function writeZoomWindow(fn: Fn1D, x: number, K: number): void {
    const { X, Z } = zoomSamples(fn, x, K, SAMPLES);
    // Scratch endpoints, so a zoom step allocates nothing per segment.
    const from: [number, number] = [0, 0];
    const to: [number, number] = [0, 0];
    let n = 0;
    for (let i = 0; i + 1 < X.length; i++) {
      from[0] = X[i]!;
      from[1] = Z[i]!;
      to[0] = X[i + 1]!;
      to[1] = Z[i + 1]!;
      const clipped = clipSegment(from, to, CLIP);
      if (clipped === null) continue;
      const [a, b] = clipped;
      if (Math.abs(b[0] - a[0]) < SEGMENT_EPS && Math.abs(b[1] - a[1]) < SEGMENT_EPS) continue;
      for (const point of clipped) {
        main.positions[n * 3] = point[0];
        main.positions[n * 3 + 2] = point[1];
        n++;
      }
    }
    commit(main, n);
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
      applyVisibility();
    },

    setZoom(fn: Fn1D, x: number, K: number): void {
      zoomed = K > 1;
      if (zoomed) {
        writeZoomWindow(fn, x, K);
      } else {
        restoreDomainCurve();
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
        const points: readonly (readonly [number, number])[] = [
          [px, pz],
          [px, markerZ],
          [px - GUIDE_TICK, markerZ],
          [px + GUIDE_TICK, markerZ],
        ];
        for (let i = 0; i < points.length; i++) {
          guides.positions[i * 3] = points[i]![0];
          guides.positions[i * 3 + 2] = points[i]![1];
        }
        commit(guides, points.length);
      }
      applyVisibility();
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      for (const layer of [prime, main, guides]) {
        layer.geometry.dispose();
        layer.material.dispose();
      }
    },
  };
}
