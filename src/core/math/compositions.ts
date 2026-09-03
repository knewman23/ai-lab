export type CompKey = "sin3x" | "sinsq" | "gauss" | "sqrtq" | "sincube";

/** A composed function y = f(g(x)) with its pieces and display scales for the chain rule scene. */
export interface Composition {
  readonly key: CompKey;
  readonly title: string;
  readonly tex: string; // KaTeX for y = f(g(x)) expanded
  readonly texG: string; // KaTeX for u = g(x)
  readonly texF: string; // KaTeX for y = f(u)
  readonly texPrime: string; // KaTeX for the chain rule written out
  readonly g: (x: number) => number;
  readonly dg: (x: number) => number;
  /** Outer function; NaN where undefined. */
  readonly f: (u: number) => number;
  /** Outer derivative; NaN where f is undefined (may be infinite at a domain edge). */
  readonly df: (u: number) => number;
  /** Display scale applied to u so |su * g| <= 3 on the domain. */
  readonly su: number;
  /** Display scale applied to y so |sy * f(g)| <= 3 on the domain. */
  readonly sy: number;
  readonly start: number;
  /** "What to look for" sentence shown in the explanation panel. */
  readonly hint: string;
}

/** Domain shared by every composition's x axis. */
export const DOMAIN = [-3, 3] as const satisfies readonly [number, number];

/** Range of the Δx slider. */
export const DX_RANGE = [1e-3, 2] as const satisfies readonly [number, number];

/** Side length of the cube's faces (the u and y axes each span [-3, 3]). */
export const FACE = 6;

/** Below this, a remaining Δx or a |Δu| is treated as zero. */
const EPS = 1e-9;

/** Ordered as in the spec's composition table. */
export const COMP_KEYS = [
  "sin3x",
  "sinsq",
  "gauss",
  "sqrtq",
  "sincube",
] as const satisfies readonly CompKey[];

export const COMPOSITIONS: Readonly<Record<CompKey, Composition>> = {
  sin3x: {
    key: "sin3x",
    title: "sin 3x",
    tex: "\\sin 3x",
    texG: "3x",
    texF: "\\sin u",
    texPrime: "\\cos(3x)\\cdot 3",
    g: (x) => 3 * x,
    dg: () => 3,
    f: (u) => Math.sin(u),
    df: (u) => Math.cos(u),
    su: 1 / 3,
    sy: 2.5,
    start: 0.4,
    hint: "A linear inner function: the composite's slope is just the outer slope times 3.",
  },
  sinsq: {
    key: "sinsq",
    title: "sin x²",
    tex: "\\sin x^2",
    texG: "x^2",
    texF: "\\sin u",
    texPrime: "\\cos(x^2)\\cdot 2x",
    g: (x) => x * x,
    dg: (x) => 2 * x,
    f: (u) => Math.sin(u),
    df: (u) => Math.cos(u),
    su: 1 / 3,
    sy: 2.5,
    start: 1.2,
    hint: "The inner slope 2x grows with x, so the composite oscillates faster further out.",
  },
  gauss: {
    key: "gauss",
    title: "e^(−x²/2)",
    tex: "e^{-x^2/2}",
    texG: "-x^2/2",
    texF: "e^{u}",
    texPrime: "e^{-x^2/2}\\cdot(-x)",
    g: (x) => (-x * x) / 2,
    dg: (x) => -x,
    f: (u) => Math.exp(u),
    df: (u) => Math.exp(u),
    su: 2 / 3,
    sy: 2.5,
    start: 1,
    hint: "The bell curve: f′ = f, so the outer slope equals the outer height; the side curve leaves the wall above u ≈ 0.18 and is clipped there.",
  },
  sqrtq: {
    key: "sqrtq",
    title: "√(x²+1)",
    tex: "\\sqrt{x^2+1}",
    texG: "x^2+1",
    texF: "\\sqrt{u}",
    texPrime: "\\frac{1}{2\\sqrt{x^2+1}}\\cdot 2x",
    g: (x) => x * x + 1,
    dg: (x) => 2 * x,
    f: (u) => (u < 0 ? NaN : Math.sqrt(u)),
    df: (u) => (u < 0 ? NaN : 1 / (2 * Math.sqrt(u))),
    su: 0.3,
    sy: 0.9,
    start: 1.5,
    hint: "f is undefined for u < 0: the side curve starts at (u, y) = (0, 0), the centre of the wall's y axis.",
  },
  sincube: {
    key: "sincube",
    title: "sin³x",
    tex: "\\sin^3 x",
    texG: "\\sin x",
    texF: "u^3",
    texPrime: "3\\sin^2 x\\cdot\\cos x",
    g: (x) => Math.sin(x),
    dg: (x) => Math.cos(x),
    f: (u) => u * u * u,
    df: (u) => 3 * u * u,
    su: 3,
    sy: 2.5,
    start: 0.8,
    hint: "g′ = cos x is zero at the peaks of sin x, so the product, and the composite's slope, vanish there.",
  },
};

/** Everything the scene reads at a single x: the inner and outer values, both derivatives, and their product. */
export interface Evaluation {
  readonly u: number;
  readonly y: number;
  readonly dg: number;
  readonly df: number;
  readonly dydx: number;
}

/** Finite differences over one step Δx: the changes Δu, Δy and the three difference quotients. */
export interface Deltas {
  readonly du: number;
  readonly dy: number;
  readonly duDx: number;
  /** Δy/Δu, or null when |Δu| < EPS. */
  readonly dyDu: number | null;
  readonly dyDx: number;
}

/** Evaluates the composition and both derivatives at x; `dydx = df(u) * dg(x)`. */
export function evaluate(c: Composition, x: number): Evaluation {
  const u = c.g(x);
  const dg = c.dg(x);
  const df = c.df(u);
  return { u, y: c.f(u), dg, df, dydx: df * dg };
}

/** Clips Δx so x + Δx stays within the domain's right edge; null when no room remains or the inputs are not finite. */
export function effectiveDx(x: number, dx: number): number | null {
  const clipped = Math.min(dx, DOMAIN[1] - x);
  return !Number.isFinite(clipped) || clipped < EPS ? null : clipped;
}

/** Finite differences over one step Δx. `dxEff` must be a non-null result of `effectiveDx`. */
export function deltas(c: Composition, x: number, dxEff: number): Deltas {
  const u0 = c.g(x);
  const u1 = c.g(x + dxEff);
  const du = u1 - u0;
  const dy = c.f(u1) - c.f(u0);
  return {
    du,
    dy,
    duDx: du / dxEff,
    dyDu: Math.abs(du) < EPS ? null : dy / du,
    dyDx: dy / dxEff,
  };
}

/** Display slope dY/dZ of the side curve at u: sy * f′(u) / su, or null when f′(u) is not finite. */
export function sideSlope(c: Composition, u: number): number | null {
  const df = c.df(u);
  return Number.isFinite(df) ? (c.sy * df) / c.su : null;
}
