import type { Vec2 } from "../../core/math/numeric";
import type { Eigen, Mat2 } from "../../core/math/matrix2";
import { columns, det, eigen, fromColumns, lerpIdentity, trace } from "../../core/math/matrix2";
import type { PresetKey } from "./presets";
import { PRESETS } from "./presets";

/** Overlay toggles shown alongside the visualization. */
export type ShowKey = "grid" | "eigen" | "ghost";

const ENTRY_BOUND = 3;

const DEFAULT_SHOW: Readonly<Record<ShowKey, boolean>> = {
  grid: true,
  eigen: true,
  ghost: true,
};

/** Matrix transformation visualization state. */
export interface MtState {
  /** The matrix being edited (t = 1). */
  readonly m: Mat2;
  /** Animate parameter, 0..1, default 1. */
  readonly t: number;
  readonly preset: PresetKey | "custom";
  readonly show: Readonly<Record<ShowKey, boolean>>;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function initialState(): MtState {
  return {
    m: PRESETS.identity.m,
    t: 1,
    preset: "identity",
    show: DEFAULT_SHOW,
  };
}

export function setEntry(s: MtState, i: 0 | 1 | 2 | 3, v: number): MtState {
  if (!Number.isFinite(v)) return s;
  const clamped = clamp(v, -ENTRY_BOUND, ENTRY_BOUND);
  const m = [...s.m] as [number, number, number, number];
  m[i] = clamped;
  return { ...s, m, preset: "custom" };
}

export function setPreset(s: MtState, key: PresetKey): MtState {
  return { ...s, m: PRESETS[key].m, t: 1, preset: key };
}

export function dragBasis(s: MtState, which: 0 | 1, point: Vec2): MtState {
  const clamped: Vec2 = [
    clamp(point[0], -ENTRY_BOUND, ENTRY_BOUND),
    clamp(point[1], -ENTRY_BOUND, ENTRY_BOUND),
  ];
  const [c0, c1] = columns(s.m);
  const m = which === 0 ? fromColumns(clamped, c1) : fromColumns(c0, clamped);
  return { ...s, m, preset: "custom" };
}

export function setT(s: MtState, t: number): MtState {
  return { ...s, t: clamp(t, 0, 1) };
}

export function setShow(s: MtState, key: ShowKey, on: boolean): MtState {
  return { ...s, show: { ...s.show, [key]: on } };
}

export function reset(s: MtState): MtState {
  return { ...s, m: PRESETS.identity.m, t: 1, preset: "identity" };
}

/** Allocates a new object each call; call once per state change (e.g. per render), not in a hot loop. */
export function derived(s: MtState): {
  readonly mt: Mat2;
  readonly detMt: number;
  readonly detM: number;
  readonly traceM: number;
  readonly eigen: Eigen;
  readonly area: number;
  readonly orientation: "preserved" | "reversed" | "collapsed";
} {
  const mt = lerpIdentity(s.m, s.t);
  const detMt = det(mt);
  const detM = det(s.m);
  const traceM = trace(s.m);
  const area = Math.abs(detMt);
  const orientation = detMt > 1e-6 ? "preserved" : detMt < -1e-6 ? "reversed" : "collapsed";
  return { mt, detMt, detM, traceM, eigen: eigen(s.m), area, orientation };
}
