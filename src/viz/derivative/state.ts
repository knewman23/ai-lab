import type { Derivative, FnKey } from "../../core/math/functions1d";
import { DOMAIN, FNS, effectiveH, secantSlope } from "../../core/math/functions1d";

/** Overlay toggles shown alongside the visualization. */
export type ShowKey = "tangent" | "secant" | "derivative";

/** Zoom level; window narrows by a factor of 4 per level. */
export type Zoom = 0 | 1 | 2 | 3;

/** x is snapped to `singularAt` when within this radius. */
export const SNAP_RADIUS = 0.02;

/** Highest allowed zoom level. */
export const MAX_ZOOM = 3;

/** Clamp range for the secant step size h. */
export const H_RANGE = [1e-3, 2] as const satisfies readonly [number, number];

const DEFAULT_SHOW: Readonly<Record<ShowKey, boolean>> = {
  tangent: true,
  secant: true,
  derivative: true,
};

/** Derivative explorer visualization state. */
export interface DxState {
  readonly fn: FnKey;
  readonly x: number;
  readonly h: number;
  readonly zoom: Zoom;
  readonly show: Readonly<Record<ShowKey, boolean>>;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function initialState(): DxState {
  return {
    fn: "square",
    x: FNS.square.start,
    h: 1,
    zoom: 0,
    show: DEFAULT_SHOW,
  };
}

export function setFn(s: DxState, key: FnKey): DxState {
  return { ...s, fn: key, x: FNS[key].start, zoom: 0 };
}

export function setX(s: DxState, x: number): DxState {
  if (s.zoom > 0) return s;
  let clamped = clamp(x, DOMAIN[0], DOMAIN[1]);
  const singularAt = FNS[s.fn].singularAt;
  if (singularAt !== null && Math.abs(clamped - singularAt) < SNAP_RADIUS) {
    clamped = singularAt;
  }
  return { ...s, x: clamped };
}

export function setH(s: DxState, h: number): DxState {
  return { ...s, h: clamp(h, H_RANGE[0], H_RANGE[1]) };
}

export function zoomIn(s: DxState): DxState {
  const zoom = Math.min(MAX_ZOOM, s.zoom + 1) as Zoom;
  return { ...s, zoom };
}

export function resetZoom(s: DxState): DxState {
  return { ...s, zoom: 0 };
}

export function setShow(s: DxState, key: ShowKey, on: boolean): DxState {
  return { ...s, show: { ...s.show, [key]: on } };
}

export function reset(s: DxState): DxState {
  return { ...s, x: FNS[s.fn].start, h: 1, zoom: 0 };
}

/** Allocates a new object each call; call once per state change (e.g. per render), not in a hot loop. */
export function derived(s: DxState): {
  readonly fx: number;
  readonly d: Derivative;
  readonly hEff: number | null;
  readonly secant: number | null;
  readonly gap: number | null;
  readonly K: number;
  readonly window: readonly [number, number];
  readonly secantInWindow: boolean;
} {
  const fn = FNS[s.fn];
  const fx = fn.f(s.x);
  const d = fn.d(s.x);
  const hEff = effectiveH(s.x, s.h);
  const secant = hEff === null ? null : secantSlope(fn, s.x, hEff);
  const gap = d.kind === "value" && secant !== null ? secant - d.v : null;
  const K = 4 ** s.zoom;
  const window: readonly [number, number] = s.zoom === 0 ? DOMAIN : [s.x - 3 / K, s.x + 3 / K];
  const secantInWindow = secant !== null && hEff !== null && s.x + hEff <= window[1];
  return { fx, d, hEff, secant, gap, K, window, secantInWindow };
}
