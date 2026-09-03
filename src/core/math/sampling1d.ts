import { BAND, DOMAIN, type Fn1D, SINGULAR_EPS, Z0 } from "./functions1d";

/** Even samples of the main curve over the domain: X in [-3, 3], Z = scale * f(X). */
export function curveSamples(fn: Fn1D, n = 241): { X: Float32Array; Z: Float32Array } {
  const X = new Float32Array(n);
  const Z = new Float32Array(n);
  const [lo, hi] = DOMAIN;
  for (let i = 0; i < n; i++) {
    const x = lo + (i / (n - 1)) * (hi - lo);
    X[i] = x;
    Z[i] = fn.scale * fn.f(x);
  }
  return { X, Z };
}

function clampBand(z: number): number {
  return Math.max(BAND[0], Math.min(BAND[1], z));
}

/**
 * Samples of the derivative curve, split into separate runs at `singularAt` so a jump or
 * vertical tangent is drawn as a gap rather than a riser. Functions with no singularity produce
 * a single run of length `n`; a function with a singularity produces two runs whose lengths sum
 * to `n` or `n - 1` (one fewer when a grid sample lands exactly on the singularity, in which case
 * that sample is dropped rather than assigned to either run). The return type is
 * `readonly { X: Float32Array; Z: Float32Array }[]`: a variable-length array of runs.
 *
 * A run boundary is placed wherever consecutive grid samples straddle `singularAt` (one on each
 * side, by sign of `x - singularAt`) as well as at an exact hit, so the split is correct for any
 * `n` and any `singularAt`, not just grid points that land exactly on it.
 */
export function primeSamples(fn: Fn1D, n = 241): readonly { X: Float32Array; Z: Float32Array }[] {
  const [lo, hi] = DOMAIN;
  const xs: number[] = [];
  for (let i = 0; i < n; i++) {
    xs.push(lo + (i / (n - 1)) * (hi - lo));
  }

  const singular = fn.singularAt;
  let current: number[] = [];
  const segments: number[][] = [current];
  let prevSide: number | null = null;
  for (const x of xs) {
    if (singular !== null) {
      const side = x - singular;
      if (Math.abs(side) < SINGULAR_EPS) {
        // Exact hit: drop this sample and start a fresh run.
        current = [];
        segments.push(current);
        prevSide = null;
        continue;
      }
      if (prevSide !== null && prevSide * side < 0) {
        // Straddled the singularity between the previous sample and this one.
        current = [];
        segments.push(current);
      }
      prevSide = side;
    }
    current.push(x);
  }

  return segments
    .filter((seg) => seg.length > 0)
    .map((seg) => {
      const X = new Float32Array(seg.length);
      const Z = new Float32Array(seg.length);
      for (let i = 0; i < seg.length; i++) {
        const x = seg[i] as number;
        const d = fn.d(x);
        const v = d.kind === "value" ? d.v : 0;
        X[i] = x;
        Z[i] = clampBand(Z0 + fn.primeScale * v);
      }
      return { X, Z };
    });
}

/**
 * Zoomed samples around a point: the window [x - 3/K, x + 3/K] re-sampled in display
 * coordinates X = (x' - x) * K, Z = scale * (f(x') - f(x)) * K, so the point sits at (0, 0)
 * and the display slope is scale * f'(x).
 */
export function zoomSamples(
  fn: Fn1D,
  x: number,
  K: number,
  n = 241,
): { X: Float32Array; Z: Float32Array } {
  const halfWidth = 3 / K;
  const X = new Float32Array(n);
  const Z = new Float32Array(n);
  const fx = fn.f(x);
  for (let i = 0; i < n; i++) {
    const xp = x - halfWidth + (i / (n - 1)) * (2 * halfWidth);
    X[i] = (xp - x) * K;
    Z[i] = fn.scale * (fn.f(xp) - fx) * K;
  }
  return { X, Z };
}
