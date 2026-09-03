import type { Vec2 } from "../../core/math/numeric";
import { isFinitePoint } from "../../core/math/numeric";
import type { OptimizerKey } from "../../core/math/optimizers";
import { getOptimizer } from "../../core/math/optimizers";
import type { SurfaceKey } from "../../core/math/surfaces";
import { SURFACES, clampToDomain, isInDomain } from "../../core/math/surfaces";
import { RingBuffer } from "../../core/math/ring-buffer";

/** Run status: "ok" while stepping normally, otherwise the run is paused. */
export type GdStatus = "ok" | "left-domain" | "diverged";

/** Overlay toggles shown alongside the visualization. */
export type ShowKey = "tangent" | "contours" | "path";

/** Path ring buffer capacity, per spec section 5. */
export const PATH_CAPACITY = 2000;

/**
 * Gradient descent visualization state.
 *
 * `path` is the one deliberately shared, mutated-in-place object: every
 * reducer that needs a fresh path (drag/reset/setSurface/setOptimizer)
 * creates a new `RingBuffer` rather than mutating an old one in place, so
 * that stale references (e.g. held by prior state snapshots) are not
 * retroactively changed. `step` pushes onto the existing buffer, mutating it
 * in place by design, since path history is intentionally not part of the
 * immutable diffing surface.
 */
export interface GdState {
  readonly surface: SurfaceKey;
  readonly optimizer: OptimizerKey;
  readonly lr: number;
  readonly pos: Vec2;
  readonly optState: unknown;
  readonly steps: number;
  readonly status: GdStatus;
  readonly running: boolean;
  readonly path: RingBuffer<Vec2>;
  readonly show: Readonly<Record<ShowKey, boolean>>;
}

const DEFAULT_SHOW: Readonly<Record<ShowKey, boolean>> = {
  tangent: true,
  contours: true,
  path: true,
};

function freshPath(pos: Vec2): RingBuffer<Vec2> {
  const path = new RingBuffer<Vec2>(PATH_CAPACITY);
  path.push(pos);
  return path;
}

export function initialState(): GdState {
  const surface = SURFACES.bowl;
  return {
    surface: surface.key,
    optimizer: "sgd",
    lr: SURFACES.bowl.defaultLr,
    pos: surface.start,
    optState: getOptimizer("sgd").init(),
    steps: 0,
    status: "ok",
    running: false,
    path: freshPath(surface.start),
    show: DEFAULT_SHOW,
  };
}

export function step(s: GdState): GdState {
  if (s.status !== "ok") return s;

  const surface = SURFACES[s.surface];
  const optimizer = getOptimizer(s.optimizer);
  const grad = surface.grad(s.pos[0], s.pos[1]);
  const result = optimizer.step(s.pos, grad, s.lr, s.optState);
  const pos = result.pos;

  let status: GdStatus = "ok";
  if (!isFinitePoint(pos)) {
    status = "diverged";
  } else if (!isInDomain(surface, pos)) {
    status = "left-domain";
  }

  s.path.push(pos);

  return {
    ...s,
    pos,
    optState: result.state,
    steps: s.steps + 1,
    status,
    running: status === "ok" ? s.running : false,
    path: s.path,
  };
}

export function drag(s: GdState, p: Vec2): GdState {
  const surface = SURFACES[s.surface];
  const pos = clampToDomain(surface, p);
  return {
    ...s,
    pos,
    optState: getOptimizer(s.optimizer).init(),
    steps: 0,
    status: "ok",
    running: false,
    path: freshPath(pos),
  };
}

export function reset(s: GdState): GdState {
  const surface = SURFACES[s.surface];
  return {
    ...s,
    pos: surface.start,
    optState: getOptimizer(s.optimizer).init(),
    steps: 0,
    status: "ok",
    running: false,
    path: freshPath(surface.start),
  };
}

export function setSurface(s: GdState, key: SurfaceKey): GdState {
  const surface = SURFACES[key];
  return {
    ...s,
    surface: key,
    lr: surface.defaultLr,
    pos: surface.start,
    optState: getOptimizer(s.optimizer).init(),
    steps: 0,
    status: "ok",
    running: false,
    path: freshPath(surface.start),
  };
}

export function setOptimizer(s: GdState, key: OptimizerKey): GdState {
  // Optimizer change keeps the marker in place per spec, but only when the
  // marker is at a valid position. If the prior run had already diverged or
  // left the domain, `s.pos` is non-finite or out of bounds, and carrying it
  // forward here would silently resurrect it as a fresh "ok" position (with
  // canStep true) even though it's still invalid. Fall back to the surface's
  // start point in that case, matching `reset`'s pos.
  const surface = SURFACES[s.surface];
  const pos = s.status === "ok" ? s.pos : surface.start;
  return {
    ...s,
    optimizer: key,
    pos,
    optState: getOptimizer(key).init(),
    steps: 0,
    status: "ok",
    running: false,
    path: freshPath(pos),
  };
}

export function setLr(s: GdState, lr: number): GdState {
  return { ...s, lr };
}

export function toggleRun(s: GdState): GdState {
  if (s.status !== "ok") return { ...s, running: false };
  return { ...s, running: !s.running };
}

export function setShow(s: GdState, key: ShowKey, on: boolean): GdState {
  return { ...s, show: { ...s.show, [key]: on } };
}

/** Allocates a new object each call; call once per state change (e.g. per render), not in a hot loop. */
export function derived(s: GdState): {
  readonly loss: number;
  readonly grad: Vec2;
  readonly gradMag: number;
  readonly canStep: boolean;
} {
  const surface = SURFACES[s.surface];
  const [x, y] = s.pos;
  const loss = surface.f(x, y);
  const grad = surface.grad(x, y);
  const gradMag = Math.hypot(grad[0], grad[1]);
  return { loss, grad, gradMag, canStep: s.status === "ok" };
}
