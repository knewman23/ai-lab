import type { Vec2 } from "./numeric";

export type OptimizerKey = "sgd" | "momentum" | "adam";

/** Ordered as in the spec's optimizer table. */
export const OPTIMIZER_KEYS = [
  "sgd",
  "momentum",
  "adam",
] as const satisfies readonly OptimizerKey[];

/** State carried between steps, keyed by optimizer. SGD is stateless. */
interface StateMap {
  readonly sgd: null;
  readonly momentum: { readonly v: Vec2 };
  readonly adam: { readonly m: Vec2; readonly v: Vec2; readonly t: number };
}

type StateFor<K extends OptimizerKey> = StateMap[K];

export interface Optimizer<S> {
  readonly key: OptimizerKey;
  readonly title: string;
  readonly init: () => S;
  readonly step: (pos: Vec2, grad: Vec2, lr: number, state: S) => { pos: Vec2; state: S };
  /** KaTeX source for the update rule with `lr` substituted, e.g. "\theta \leftarrow \theta - 0.1\,\nabla f" */
  readonly equation: (lr: number) => string;
}

const MOMENTUM_BETA = 0.9;
const ADAM_BETA1 = 0.9;
const ADAM_BETA2 = 0.999;
const ADAM_EPS = 1e-8;

/**
 * Formats a learning rate to 3 significant digits with trailing zeros
 * stripped, for display in equations and controls (e.g. 0.1 -> "0.1",
 * 0.0316227766 -> "0.0316").
 */
export function formatLr(lr: number): string {
  return Number(lr.toPrecision(3)).toString();
}

const sgd: Optimizer<StateFor<"sgd">> = {
  key: "sgd",
  title: "SGD",
  init: () => null,
  step: (pos, grad, lr, state) => ({
    pos: [pos[0] - lr * grad[0], pos[1] - lr * grad[1]],
    state,
  }),
  equation: (lr) => `\\theta \\leftarrow \\theta - ${formatLr(lr)}\\,\\nabla f(\\theta)`,
};

const momentum: Optimizer<StateFor<"momentum">> = {
  key: "momentum",
  title: "SGD + momentum",
  init: () => ({ v: [0, 0] }),
  step: (pos, grad, lr, state) => {
    const v: Vec2 = [
      MOMENTUM_BETA * state.v[0] - lr * grad[0],
      MOMENTUM_BETA * state.v[1] - lr * grad[1],
    ];
    const pos2: Vec2 = [pos[0] + v[0], pos[1] + v[1]];
    return { pos: pos2, state: { v } };
  },
  equation: (lr) =>
    `v \\leftarrow ${formatLr(MOMENTUM_BETA)}\\,v - ${formatLr(lr)}\\,\\nabla f(\\theta),\\quad \\theta \\leftarrow \\theta + v`,
};

const adam: Optimizer<StateFor<"adam">> = {
  key: "adam",
  title: "Adam",
  init: () => ({ m: [0, 0], v: [0, 0], t: 0 }),
  step: (pos, grad, lr, state) => {
    const t = state.t + 1;
    const m: Vec2 = [
      ADAM_BETA1 * state.m[0] + (1 - ADAM_BETA1) * grad[0],
      ADAM_BETA1 * state.m[1] + (1 - ADAM_BETA1) * grad[1],
    ];
    const v: Vec2 = [
      ADAM_BETA2 * state.v[0] + (1 - ADAM_BETA2) * grad[0] * grad[0],
      ADAM_BETA2 * state.v[1] + (1 - ADAM_BETA2) * grad[1] * grad[1],
    ];
    const mHat: Vec2 = [m[0] / (1 - ADAM_BETA1 ** t), m[1] / (1 - ADAM_BETA1 ** t)];
    const vHat: Vec2 = [v[0] / (1 - ADAM_BETA2 ** t), v[1] / (1 - ADAM_BETA2 ** t)];
    const pos2: Vec2 = [
      pos[0] - (lr * mHat[0]) / (Math.sqrt(vHat[0]) + ADAM_EPS),
      pos[1] - (lr * mHat[1]) / (Math.sqrt(vHat[1]) + ADAM_EPS),
    ];
    return { pos: pos2, state: { m, v, t } };
  },
  equation: (lr) =>
    `\\begin{aligned} m &\\leftarrow ${formatLr(ADAM_BETA1)}\\,m + ${formatLr(1 - ADAM_BETA1)}\\,\\nabla f(\\theta) \\\\ v &\\leftarrow ${formatLr(ADAM_BETA2)}\\,v + ${formatLr(1 - ADAM_BETA2)}\\,\\nabla f(\\theta)^2 \\\\ \\theta &\\leftarrow \\theta - ${formatLr(lr)}\\,\\frac{\\hat m}{\\sqrt{\\hat v} + \\varepsilon} \\end{aligned}`,
};

export const OPTIMIZERS: { readonly [K in OptimizerKey]: Optimizer<StateFor<K>> } = {
  sgd,
  momentum,
  adam,
};

/** Type-erased optimizer, for call sites (the state machine) that hold a key at runtime rather than a literal type. */
export type AnyOptimizer = Optimizer<unknown>;

/**
 * Returns an optimizer with its state type erased to `unknown`.
 * Safe because every `Optimizer<S>`'s `init`/`step` only ever produce and
 * consume its own `S`; callers that go through this accessor treat state as
 * an opaque value they pass straight back into `step`, never inspect it.
 */
export function getOptimizer(key: OptimizerKey): AnyOptimizer {
  return OPTIMIZERS[key] as AnyOptimizer;
}
