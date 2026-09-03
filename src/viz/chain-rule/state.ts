import type { CompKey, Composition, Deltas, Evaluation } from "../../core/math/compositions";
import {
  COMPOSITIONS,
  DOMAIN,
  DX_RANGE,
  deltas,
  effectiveDx,
  evaluate,
  sideSlope,
} from "../../core/math/compositions";

/** Overlay toggles shown alongside the visualization. */
export type ShowKey = "triangles" | "secants" | "tangents" | "connectors";

/** Δx the scene starts with and returns to on reset. */
export const DX_DEFAULT = 0.5;

const DEFAULT_SHOW: Readonly<Record<ShowKey, boolean>> = {
  triangles: true,
  secants: true,
  tangents: false,
  connectors: true,
};

/** Chain rule graph visualization state. */
export interface ChainState {
  readonly comp: CompKey;
  readonly x: number;
  readonly dx: number;
  readonly show: Readonly<Record<ShowKey, boolean>>;
}

/** Everything the scene reads at the current state; see `derived`. */
export interface Derived extends Evaluation {
  readonly comp: Composition;
  /** Δx clipped to the domain's right edge, or null when x is at the edge. */
  readonly dxEff: number | null;
  /** Finite differences over `dxEff`, or null when `dxEff` is null. */
  readonly deltas: Deltas | null;
  /** Display slope of the side curve at u, or null where f′ is not finite. */
  readonly sideSlope: number | null;
  /** True when a Δx step exists and at least one of the triangles or secants overlays is on. */
  readonly showPrimed: boolean;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function initialState(): ChainState {
  return {
    comp: "sin3x",
    x: COMPOSITIONS.sin3x.start,
    dx: DX_DEFAULT,
    show: DEFAULT_SHOW,
  };
}

/** Switches composition; x moves to the new preset's start, Δx is kept. */
export function setComp(s: ChainState, key: CompKey): ChainState {
  return { ...s, comp: key, x: COMPOSITIONS[key].start };
}

export function setX(s: ChainState, x: number): ChainState {
  return { ...s, x: clamp(x, DOMAIN[0], DOMAIN[1]) };
}

export function setDx(s: ChainState, dx: number): ChainState {
  return { ...s, dx: clamp(dx, DX_RANGE[0], DX_RANGE[1]) };
}

export function setShow(s: ChainState, key: ShowKey, on: boolean): ChainState {
  return { ...s, show: { ...s.show, [key]: on } };
}

/** Returns x to the preset's start and Δx to `DX_DEFAULT`; overlay toggles are kept. */
export function reset(s: ChainState): ChainState {
  return { ...s, x: COMPOSITIONS[s.comp].start, dx: DX_DEFAULT };
}

/** Allocates a new object each call; call once per state change (e.g. per render), not in a hot loop. */
export function derived(s: ChainState): Derived {
  const comp = COMPOSITIONS[s.comp];
  const ev = evaluate(comp, s.x);
  const dxEff = effectiveDx(s.x, s.dx);
  return {
    ...ev,
    comp,
    dxEff,
    deltas: dxEff === null ? null : deltas(comp, s.x, dxEff),
    sideSlope: sideSlope(comp, ev.u),
    showPrimed: dxEff !== null && (s.show.triangles || s.show.secants),
  };
}
