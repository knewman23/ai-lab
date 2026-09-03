import type { Vec2 } from "./numeric";

export type SurfaceKey = "bowl" | "elongated" | "saddle" | "himmelblau" | "rosenbrock";

export interface Surface {
  readonly key: SurfaceKey;
  readonly title: string;
  readonly f: (x: number, y: number) => number;
  readonly grad: (x: number, y: number) => Vec2;
  readonly domain: { readonly x: readonly [number, number]; readonly y: readonly [number, number] };
  /** Display scale applied when mapping f(x, y) into scene units. */
  readonly scale: number;
  readonly start: Vec2;
  /** "What to look for" sentence shown in the explanation panel. */
  readonly hint: string;
}

/** Ordered as in the spec's surface table. */
export const SURFACE_KEYS = [
  "bowl",
  "elongated",
  "saddle",
  "himmelblau",
  "rosenbrock",
] as const satisfies readonly SurfaceKey[];

export const SURFACES: Readonly<Record<SurfaceKey, Surface>> = {
  bowl: {
    key: "bowl",
    title: "Bowl",
    f: (x, y) => x * x + y * y,
    grad: (x, y) => [2 * x, 2 * y],
    domain: { x: [-3, 3], y: [-3, 3] },
    scale: 1 / 6,
    start: [2.5, 2],
    hint: "Every start slides straight downhill to the origin: the canonical convex case.",
  },
  elongated: {
    key: "elongated",
    title: "Elongated bowl",
    f: (x, y) => x * x + 10 * y * y,
    grad: (x, y) => [2 * x, 20 * y],
    domain: { x: [-3, 3], y: [-3, 3] },
    scale: 1 / 30,
    start: [2.5, 1.5],
    hint: "Raise the learning rate until the path overshoots the narrow axis.",
  },
  saddle: {
    key: "saddle",
    title: "Saddle",
    f: (x, y) => x * x - y * y,
    grad: (x, y) => [2 * x, -2 * y],
    domain: { x: [-3, 3], y: [-3, 3] },
    scale: 1 / 6,
    start: [2.5, 0.05],
    hint: "The ball slides off along y until it leaves the domain: that's the optimizer escaping a saddle.",
  },
  himmelblau: {
    key: "himmelblau",
    title: "Himmelblau",
    f: (x, y) => (x * x + y - 11) ** 2 + (x + y * y - 7) ** 2,
    grad: (x, y) => {
      const a = x * x + y - 11;
      const b = x + y * y - 7;
      return [2 * a * (2 * x) + 2 * b, 2 * a + 2 * b * (2 * y)];
    },
    domain: { x: [-5, 5], y: [-5, 5] },
    scale: 1 / 300,
    start: [0, 0],
    hint: "Four minima share this bowl: which one you reach depends on the start.",
  },
  rosenbrock: {
    key: "rosenbrock",
    title: "Rosenbrock",
    f: (x, y) => (1 - x) ** 2 + 100 * (y - x * x) ** 2,
    grad: (x, y) => {
      const gx = -2 * (1 - x) - 400 * x * (y - x * x);
      const gy = 200 * (y - x * x);
      return [gx, gy];
    },
    domain: { x: [-2, 2], y: [-1, 3] },
    scale: 1 / 800,
    start: [-1.5, 2.5],
    hint: "The path finds the narrow valley fast, then crawls along it toward the minimum.",
  },
};

/** True when a point lies within a surface's domain, corners included. */
export function isInDomain(surface: Surface, p: Vec2): boolean {
  const [x, y] = p;
  const { x: xr, y: yr } = surface.domain;
  return x >= xr[0] && x <= xr[1] && y >= yr[0] && y <= yr[1];
}

/** Clamps a point to a surface's domain, component-wise. */
export function clampToDomain(surface: Surface, p: Vec2): Vec2 {
  const [x, y] = p;
  const { x: xr, y: yr } = surface.domain;
  const cx = Math.min(Math.max(x, xr[0]), xr[1]);
  const cy = Math.min(Math.max(y, yr[0]), yr[1]);
  return [cx, cy];
}
