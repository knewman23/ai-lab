import type { DatasetKey } from "./datasets";
import { mulberry32 } from "./prng";

/** The one architecture the scene shows: two inputs, two hidden layers of four, one output. */
export const SIZES = [2, 4, 4, 1] as const;

/** Weights and biases per layer; `weights[l]` is an out×in matrix stored row-major. */
export interface Params {
  readonly weights: readonly Float64Array[];
  readonly biases: readonly Float64Array[];
}

/** One labelled 2D point; targets are ±1 to match the tanh output. */
export interface DataPoint {
  readonly x: readonly [number, number];
  readonly y: 1 | -1;
}

/** A toy classification problem, built once at module load and never re-rolled. */
export interface Dataset {
  readonly key: DatasetKey;
  readonly title: string;
  readonly points: readonly DataPoint[];
  /** A weight-init seed verified to train this dataset to ≥ 0.9 accuracy at the default lr. */
  readonly startSeed: number;
  readonly hint: string;
}

/**
 * Uniform(−1, 1) weights and biases, micrograd style. The draw order is fixed so a seed pins the
 * whole parameter set: for each layer in order, the weight matrix row-major, then that layer's biases.
 */
export function initParams(seed: number): Params {
  const rand = mulberry32(seed);
  const weights: Float64Array[] = [];
  const biases: Float64Array[] = [];
  for (let l = 0; l + 1 < SIZES.length; l++) {
    const inputs = SIZES[l] ?? 0;
    const outputs = SIZES[l + 1] ?? 0;
    const w = new Float64Array(outputs * inputs);
    for (let i = 0; i < w.length; i++) w[i] = 2 * rand() - 1;
    const b = new Float64Array(outputs);
    for (let i = 0; i < b.length; i++) b[i] = 2 * rand() - 1;
    weights.push(w);
    biases.push(b);
  }
  return { weights, biases };
}

/** Activations per layer including the raw input; tanh at every layer, the output included. */
export function forward(p: Params, x: readonly [number, number]): readonly Float64Array[] {
  const layers: Float64Array[] = [Float64Array.from(x)];
  for (let l = 0; l < p.weights.length; l++) {
    const w = p.weights[l];
    const b = p.biases[l];
    const previous = layers[l];
    if (!w || !b || !previous) throw new Error(`mlp: missing layer ${l}`);
    const out = new Float64Array(b.length);
    for (let o = 0; o < out.length; o++) {
      let sum = b[o] ?? 0;
      for (let i = 0; i < previous.length; i++) {
        sum += (w[o * previous.length + i] ?? 0) * (previous[i] ?? 0);
      }
      out[o] = Math.tanh(sum);
    }
    layers.push(out);
  }
  return layers;
}

/** The network's single output at `x`. */
export function predict(p: Params, x: readonly [number, number]): number {
  const layers = forward(p, x);
  return layers[layers.length - 1]?.[0] ?? NaN;
}

/** Mean squared error over the dataset: mean of (predict − y)². */
export function loss(p: Params, d: Dataset): number {
  let total = 0;
  for (const point of d.points) {
    const error = predict(p, point.x) - point.y;
    total += error * error;
  }
  return d.points.length === 0 ? 0 : total / d.points.length;
}

function zerosLike(p: Params): { weights: Float64Array[]; biases: Float64Array[] } {
  return {
    weights: p.weights.map((w) => new Float64Array(w.length)),
    biases: p.biases.map((b) => new Float64Array(b.length)),
  };
}

/**
 * The exact ∂loss/∂θ by backpropagation: `dL/da_out = 2(ŷ − y)/N` per point (the factor 2 from the
 * square and the 1/N from the mean), then `δ = dL/da · (1 − a²)` back through the tanh layers.
 */
export function gradients(p: Params, d: Dataset): Params {
  const g = zerosLike(p);
  const n = d.points.length || 1;
  for (const point of d.points) {
    const a = forward(p, point.x);
    const last = a[a.length - 1];
    if (!last) throw new Error("mlp: empty forward pass");
    let dA = Float64Array.from([(2 * ((last[0] ?? NaN) - point.y)) / n]);
    for (let l = p.weights.length - 1; l >= 0; l--) {
      const w = p.weights[l];
      const previous = a[l];
      const current = a[l + 1];
      const gw = g.weights[l];
      const gb = g.biases[l];
      if (!w || !previous || !current || !gw || !gb) throw new Error(`mlp: missing layer ${l}`);
      const dPrevious = new Float64Array(previous.length);
      for (let o = 0; o < current.length; o++) {
        const out = current[o] ?? 0;
        const delta = (dA[o] ?? 0) * (1 - out * out);
        gb[o] = (gb[o] ?? 0) + delta;
        for (let i = 0; i < previous.length; i++) {
          const k = o * previous.length + i;
          gw[k] = (gw[k] ?? 0) + delta * (previous[i] ?? 0);
          dPrevious[i] = (dPrevious[i] ?? 0) + delta * (w[k] ?? 0);
        }
      }
      dA = dPrevious;
    }
  }
  return g;
}

/** One gradient descent step, `p − lr·g`, into fresh arrays; `p` is untouched. */
export function step(p: Params, g: Params, lr: number): Params {
  const apply = (a: readonly Float64Array[], b: readonly Float64Array[]): Float64Array[] =>
    a.map((arr, l) => {
      const grad = b[l];
      const next = new Float64Array(arr.length);
      for (let i = 0; i < arr.length; i++) next[i] = (arr[i] ?? 0) - lr * (grad?.[i] ?? 0);
      return next;
    });
  return { weights: apply(p.weights, g.weights), biases: apply(p.biases, g.biases) };
}

/** Fraction of points whose prediction has the target's sign; an output of exactly 0 is wrong. */
export function accuracy(p: Params, d: Dataset): number {
  if (d.points.length === 0) return 0;
  let correct = 0;
  for (const point of d.points) {
    const out = predict(p, point.x);
    if (out > 0 ? point.y === 1 : out < 0 && point.y === -1) correct++;
  }
  return correct / d.points.length;
}

/** The output over the whole domain, row-major entry `ix + n·iy`, x and y both increasing −3 → 3. */
export function boundaryGrid(p: Params, n = 40): Float32Array {
  const grid = new Float32Array(n * n);
  for (let iy = 0; iy < n; iy++) {
    const y = -3 + (6 * iy) / (n - 1);
    for (let ix = 0; ix < n; ix++) {
      grid[ix + n * iy] = predict(p, [-3 + (6 * ix) / (n - 1), y]);
    }
  }
  return grid;
}
