/** A 1D function's derivative at a point, classified for display. */
export type Derivative =
  | { readonly kind: "value"; readonly v: number }
  | { readonly kind: "jump"; readonly left: number; readonly right: number }
  | { readonly kind: "vertical" };

export type FnKey = "square" | "cubic" | "sine" | "exp" | "abs" | "sqrtabs";

export interface Fn1D {
  readonly key: FnKey;
  readonly title: string;
  readonly tex: string; // KaTeX for f(x)
  readonly texPrime: string; // KaTeX for f'(x)
  readonly f: (x: number) => number;
  readonly d: (x: number) => Derivative;
  /** Display scale applied to f so |scale * f| <= 3 on the domain. */
  readonly scale: number;
  /** Display scale applied to f' so it fits the derivative band. */
  readonly primeScale: number;
  readonly start: number;
  /** x at which the function has no ordinary tangent, or null if differentiable everywhere. */
  readonly singularAt: number | null;
  /** "What to look for" sentence shown in the explanation panel. */
  readonly hint: string;
}

/** Domain shared by every function's main curve. */
export const DOMAIN = [-3, 3] as const satisfies readonly [number, number];

/** Vertical offset of the derivative band's centre line. */
export const Z0 = -6;

/** Display band the derivative curve is scaled/clamped into. */
export const BAND = [-8.5, -3.5] as const satisfies readonly [number, number];

/** Distance from a singular point (or the domain edge) below which it is treated as reached. */
export const SINGULAR_EPS = 1e-9;

function sign(x: number): number {
  return x < 0 ? -1 : 1;
}

/** Ordered as in the spec's function table. */
export const FN_KEYS = [
  "square",
  "cubic",
  "sine",
  "exp",
  "abs",
  "sqrtabs",
] as const satisfies readonly FnKey[];

export const FNS: Readonly<Record<FnKey, Fn1D>> = {
  square: {
    key: "square",
    title: "x²",
    tex: "x^2",
    texPrime: "2x",
    f: (x) => x * x,
    d: (x) => ({ kind: "value", v: 2 * x }),
    scale: 1 / 3,
    primeScale: 1 / 2.4,
    start: 1.5,
    singularAt: null,
    hint: "The first derivative everyone meets: the parabola's slope grows linearly.",
  },
  cubic: {
    key: "cubic",
    title: "x³ − 3x",
    tex: "x^3 - 3x",
    texPrime: "3x^2 - 3",
    f: (x) => x * x * x - 3 * x,
    d: (x) => ({ kind: "value", v: 3 * x * x - 3 }),
    scale: 1 / 6,
    primeScale: 1 / 9.6,
    start: 0.8,
    singularAt: null,
    hint: "Where the lower curve crosses zero is a turning point of the curve above.",
  },
  sine: {
    key: "sine",
    title: "sin x",
    tex: "\\sin x",
    texPrime: "\\cos x",
    f: (x) => Math.sin(x),
    d: (x) => ({ kind: "value", v: Math.cos(x) }),
    scale: 2,
    primeScale: 2,
    start: 1,
    singularAt: null,
    hint: "The derivative of sine is another familiar curve: cosine.",
  },
  exp: {
    key: "exp",
    title: "eˣ⁄5",
    tex: "e^{x}/5",
    texPrime: "e^{x}/5",
    f: (x) => Math.exp(x) / 5,
    d: (x) => ({ kind: "value", v: Math.exp(x) / 5 }),
    scale: 0.59,
    primeScale: 0.59,
    start: 1,
    singularAt: null,
    hint: "f′ = f: the upper and lower curves have the same shape, just read at different heights.",
  },
  abs: {
    key: "abs",
    title: "|x|",
    tex: "|x|",
    texPrime: "\\operatorname{sign}(x)",
    f: (x) => Math.abs(x),
    d: (x) => {
      if (Math.abs(x) < SINGULAR_EPS) return { kind: "jump", left: -1, right: 1 };
      return { kind: "value", v: sign(x) };
    },
    scale: 1,
    primeScale: 2,
    start: 1.2,
    singularAt: 0,
    hint: "There is no tangent at the corner: left and right slopes disagree.",
  },
  sqrtabs: {
    key: "sqrtabs",
    title: "√|x|",
    tex: "\\sqrt{|x|}",
    texPrime: "\\frac{\\operatorname{sign}(x)}{2\\sqrt{|x|}}",
    f: (x) => Math.sqrt(Math.abs(x)),
    d: (x) => {
      if (Math.abs(x) < SINGULAR_EPS) return { kind: "vertical" };
      return { kind: "value", v: sign(x) / (2 * Math.sqrt(Math.abs(x))) };
    },
    scale: 1.5,
    primeScale: 1,
    start: 1,
    singularAt: 0,
    hint: "The tangent is vertical at the origin: f′ grows without bound as x → 0.",
  },
};

/** (f(x + h) - f(x)) / h. */
export function secantSlope(fn: Fn1D, x: number, h: number): number {
  return (fn.f(x + h) - fn.f(x)) / h;
}

/** Below this remaining room, effectiveH reports no secant is possible. */
const MIN_H = 1e-9;

/** Clips h so x + h stays within the domain's right edge; null when no room remains. */
export function effectiveH(x: number, h: number): number | null {
  const room = DOMAIN[1] - x;
  const clipped = Math.min(h, room);
  return clipped < MIN_H ? null : clipped;
}
