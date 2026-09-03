import type { Vec2 } from "./numeric";

/** A 2x2 matrix [[a, b], [c, d]], stored as [a, b, c, d]. Columns are (a, c) and (b, d). */
export type Mat2 = readonly [number, number, number, number];

export type Eigen =
  | { readonly kind: "complex" }
  | { readonly kind: "uniform"; readonly value: number }
  | {
      readonly kind: "real";
      readonly pairs: readonly { readonly value: number; readonly vector: Vec2 }[];
    };

const EPS = 1e-9;

/** Applies the matrix to a vector: M * v. */
export function apply(m: Mat2, v: Vec2): Vec2 {
  const [a, b, c, d] = m;
  const [x, y] = v;
  return [a * x + b * y, c * x + d * y];
}

/** Determinant: ad - bc. */
export function det(m: Mat2): number {
  const [a, b, c, d] = m;
  return a * d - b * c;
}

/** Trace: a + d. */
export function trace(m: Mat2): number {
  const [a, , , d] = m;
  return a + d;
}

/** Linear interpolation between the identity (t = 0) and m (t = 1). */
export function lerpIdentity(m: Mat2, t: number): Mat2 {
  const [a, b, c, d] = m;
  return [1 + t * (a - 1), t * b, t * c, 1 + t * (d - 1)];
}

/** Builds a matrix from its two columns. */
export function fromColumns(v1: Vec2, v2: Vec2): Mat2 {
  return [v1[0], v2[0], v1[1], v2[1]];
}

/** Returns the matrix's two columns. */
export function columns(m: Mat2): readonly [Vec2, Vec2] {
  const [a, b, c, d] = m;
  return [
    [a, c],
    [b, d],
  ];
}

function normalize(v: Vec2): Vec2 {
  const len = Math.hypot(v[0], v[1]);
  return [v[0] / len, v[1] / len];
}

/** Normalises then orients a vector so it points in a canonical direction. */
function normalizeAndOrient(v: Vec2): Vec2 {
  const [nx, ny] = normalize(v);
  if (Math.abs(nx) < 1e-12) {
    return ny < 0 ? [-nx, -ny] : [nx, ny];
  }
  return nx < 0 ? [-nx, -ny] : [nx, ny];
}

function eigenvectorFor(m: Mat2, lambda: number): Vec2 {
  const [a, b, c, d] = m;
  if (Math.abs(b) > EPS) {
    return normalizeAndOrient([b, lambda - a]);
  }
  if (Math.abs(c) > EPS) {
    return normalizeAndOrient([lambda - d, c]);
  }
  return Math.abs(lambda - a) <= Math.abs(lambda - d) ? [1, 0] : [0, 1];
}

/** Eigen-decomposition of a 2x2 matrix, per the spec's classification. */
export function eigen(m: Mat2): Eigen {
  const [a, b, c, d] = m;
  const tr = trace(m);
  const dt = det(m);
  const disc = tr * tr - 4 * dt;

  if (disc < -EPS) {
    return { kind: "complex" };
  }

  if (Math.abs(b) < EPS && Math.abs(c) < EPS && Math.abs(a - d) < EPS) {
    return { kind: "uniform", value: a };
  }

  if (disc < EPS) {
    const lambda = tr / 2;
    return { kind: "real", pairs: [{ value: lambda, vector: eigenvectorFor(m, lambda) }] };
  }

  const sqrtDisc = Math.sqrt(disc);
  const lambdaPlus = (tr + sqrtDisc) / 2;
  const lambdaMinus = (tr - sqrtDisc) / 2;
  return {
    kind: "real",
    pairs: [
      { value: lambdaPlus, vector: eigenvectorFor(m, lambdaPlus) },
      { value: lambdaMinus, vector: eigenvectorFor(m, lambdaMinus) },
    ],
  };
}

/** Liang-Barsky clip of segment [p, q] against the square [-bound, bound]^2. */
export function clipSegment(p: Vec2, q: Vec2, bound: number): readonly [Vec2, Vec2] | null {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  let t0 = 0;
  let t1 = 1;

  const clipEdge = (pi: number, qi: number): boolean => {
    if (pi === 0) {
      return qi >= 0;
    }
    const t = qi / pi;
    if (pi < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };

  if (!clipEdge(-dx, p[0] - -bound)) return null;
  if (!clipEdge(dx, bound - p[0])) return null;
  if (!clipEdge(-dy, p[1] - -bound)) return null;
  if (!clipEdge(dy, bound - p[1])) return null;

  const rp: Vec2 = [p[0] + t0 * dx, p[1] + t0 * dy];
  const rq: Vec2 = [p[0] + t1 * dx, p[1] + t1 * dy];
  return [rp, rq];
}
