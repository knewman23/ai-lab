import type { DatasetKey } from "../../core/math/datasets";
import { DATASETS, DOMAIN } from "../../core/math/datasets";
import type { Dataset, Params } from "../../core/math/mlp";
import { accuracy, forward, gradients, initParams, loss, step } from "../../core/math/mlp";

/** Overlay toggles shown alongside the visualization. */
export type ShowKey = "weights" | "data" | "boundary";

/** Milliseconds between automatic epochs while playing: ten epochs a second. */
export const EPOCH_MS = 100;

/** Bounds of the learning-rate slider, which is logarithmic between them. */
export const LR_RANGE: readonly [number, number] = [0.001, 0.5];

const DEFAULT_LR = 0.1;

const DEFAULT_SHOW: Readonly<Record<ShowKey, boolean>> = {
  weights: true,
  data: true,
  boundary: true,
};

/** Neural network scene state. `seed` is the weight-init seed the current `params` descend from. */
export interface NnState {
  readonly dataset: DatasetKey;
  readonly seed: number;
  readonly params: Params;
  readonly epoch: number;
  readonly lr: number;
  readonly playing: boolean;
  readonly probe: readonly [number, number];
  readonly show: Readonly<Record<ShowKey, boolean>>;
}

/**
 * Everything the scene reads at the current state; see `derived`. The decision boundary grid is
 * deliberately absent: the assembler recomputes it only when `params` changes, so dragging the
 * probe costs no grid work.
 */
export interface Derived {
  readonly dataset: Dataset;
  readonly loss: number;
  readonly accuracy: number;
  /** Activations at the probe, one entry per layer including the raw input pair. */
  readonly probeActivations: readonly Float64Array[];
  readonly probeOutput: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Fresh parameters from `seed`, at epoch 0 and not playing: what both `setDataset` and `reset` do. */
function restart(s: NnState, dataset: DatasetKey, seed: number): NnState {
  return { ...s, dataset, seed, params: initParams(seed), epoch: 0, playing: false };
}

/** `xor` at its start seed, before any epoch, at lr 0.1 with the probe at the origin and all shown. */
export function initialState(): NnState {
  const seed = DATASETS.xor.startSeed;
  return {
    dataset: "xor",
    seed,
    params: initParams(seed),
    epoch: 0,
    lr: DEFAULT_LR,
    playing: false,
    probe: [0, 0],
    show: DEFAULT_SHOW,
  };
}

/**
 * Switches dataset. The seed goes to the new dataset's `startSeed` rather than carrying the old one
 * across, so no preset opens on a network that cannot learn it; training restarts from epoch 0.
 */
export function setDataset(s: NnState, key: DatasetKey): NnState {
  return restart(s, key, DATASETS[key].startSeed);
}

/** One full-batch gradient descent epoch: `params ← step(params, gradients(params, dataset), lr)`. */
export function trainEpoch(s: NnState): NnState {
  const dataset = DATASETS[s.dataset];
  return {
    ...s,
    params: step(s.params, gradients(s.params, dataset), s.lr),
    epoch: s.epoch + 1,
  };
}

/** Sets the learning rate, clamped to `LR_RANGE`. */
export function setLr(s: NnState, lr: number): NnState {
  return { ...s, lr: clamp(lr, LR_RANGE[0], LR_RANGE[1]) };
}

/** Starts or stops autoplay. */
export function setPlaying(s: NnState, on: boolean): NnState {
  return { ...s, playing: on };
}

/** Moves the probe, clamping both coordinates to the input domain. */
export function setProbe(s: NnState, p: readonly [number, number]): NnState {
  return { ...s, probe: [clamp(p[0], DOMAIN[0], DOMAIN[1]), clamp(p[1], DOMAIN[0], DOMAIN[1])] };
}

/** Turns one overlay on or off. */
export function setShow(s: NnState, key: ShowKey, on: boolean): NnState {
  return { ...s, show: { ...s.show, [key]: on } };
}

/**
 * Re-initialises the weights from the next seed and returns to epoch 0; the learning rate, probe
 * and overlay toggles are kept, so a second run looks different but is still reproducible.
 */
export function reset(s: NnState): NnState {
  return restart(s, s.dataset, s.seed + 1);
}

/** Allocates new objects each call; call once per state change (e.g. per render), not in a hot loop. */
export function derived(s: NnState): Derived {
  const dataset = DATASETS[s.dataset];
  const probeActivations = forward(s.params, [s.probe[0], s.probe[1]]);
  const last = probeActivations[probeActivations.length - 1];
  return {
    dataset,
    loss: loss(s.params, dataset),
    accuracy: accuracy(s.params, dataset),
    probeActivations,
    probeOutput: last?.[0] ?? NaN,
  };
}
