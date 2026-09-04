import { describe, expect, it } from "vitest";
import {
  accuracy,
  boundaryGrid,
  forward,
  gradients,
  initParams,
  loss,
  predict,
  SIZES,
  step,
  type Params,
} from "../../../src/core/math/mlp";
import { DATASETS, DOMAIN } from "../../../src/core/math/datasets";

const xor = DATASETS.xor;

/** A deep copy with one weight or bias perturbed, for the finite-difference check. */
function perturb(
  p: Params,
  kind: "weights" | "biases",
  layer: number,
  index: number,
  delta: number,
): Params {
  const copy: Params = {
    weights: p.weights.map((w) => Float64Array.from(w)),
    biases: p.biases.map((b) => Float64Array.from(b)),
  };
  const arr = copy[kind][layer];
  if (!arr) throw new Error(`no ${kind}[${layer}]`);
  arr[index] = (arr[index] ?? NaN) + delta;
  return copy;
}

function train(seed: number, epochs: number, lr = 0.1, dataset = xor): Params {
  let p = initParams(seed);
  for (let i = 0; i < epochs; i++) p = step(p, gradients(p, dataset), lr);
  return p;
}

describe("initParams", () => {
  it("has the 2-4-4-1 shapes", () => {
    expect([...SIZES]).toEqual([2, 4, 4, 1]);
    const p = initParams(1);
    expect(p.weights.map((w) => w.length)).toEqual([8, 16, 4]);
    expect(p.biases.map((b) => b.length)).toEqual([4, 4, 1]);
  });

  it("draws every value in (−1, 1)", () => {
    const p = initParams(1);
    for (const arr of [...p.weights, ...p.biases]) {
      for (const v of arr) {
        expect(v).toBeGreaterThan(-1);
        expect(v).toBeLessThan(1);
      }
    }
  });

  it("is identical across two calls with the same seed", () => {
    const a = initParams(1);
    const b = initParams(1);
    expect(a.weights.map((w) => [...w])).toEqual(b.weights.map((w) => [...w]));
    expect(a.biases.map((v) => [...v])).toEqual(b.biases.map((v) => [...v]));
  });
});

describe("forward", () => {
  it("returns the input layer plus one activation vector per layer", () => {
    const a = forward(initParams(1), [0.5, -1]);
    expect(a.map((v) => v.length)).toEqual([2, 4, 4, 1]);
    expect([...(a[0] ?? [])]).toEqual([0.5, -1]);
  });

  it("bounds every hidden and output activation by 1", () => {
    const p = initParams(3);
    for (const x of [
      [0, 0],
      [3, -3],
      [-3, 3],
      [1.5, 1.5],
    ] as const) {
      for (const layer of forward(p, x).slice(1)) {
        for (const v of layer) expect(Math.abs(v)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("predict is the last layer's single value", () => {
    const p = initParams(1);
    const a = forward(p, [1, -2]);
    expect(predict(p, [1, -2])).toBe(a[3]?.[0]);
  });
});

describe("gradients", () => {
  it("matches central differences of loss for every weight and bias", () => {
    const p = initParams(1);
    const g = gradients(p, xor);
    const h = 1e-5;
    for (const kind of ["weights", "biases"] as const) {
      const layers = g[kind];
      for (let l = 0; l < layers.length; l++) {
        const arr = layers[l];
        if (!arr) throw new Error(`no ${kind}[${l}]`);
        for (let i = 0; i < arr.length; i++) {
          const up = loss(perturb(p, kind, l, i, h), xor);
          const down = loss(perturb(p, kind, l, i, -h), xor);
          const numeric = (up - down) / (2 * h);
          const analytic = arr[i] ?? NaN;
          const tol = Math.max(1e-8, 1e-4 * Math.abs(numeric));
          expect(Math.abs(analytic - numeric)).toBeLessThanOrEqual(tol);
        }
      }
    }
  });
});

describe("step", () => {
  it("returns new arrays holding p − lr·g and leaves p alone", () => {
    const p = initParams(1);
    const g = gradients(p, xor);
    const before = p.weights.map((w) => [...w]);
    const next = step(p, g, 0.1);
    for (let l = 0; l < p.weights.length; l++) {
      const w = p.weights[l];
      const gw = g.weights[l];
      const nw = next.weights[l];
      if (!w || !gw || !nw) throw new Error("missing layer");
      expect(nw).not.toBe(w);
      for (let i = 0; i < w.length; i++) {
        expect(nw[i]).toBeCloseTo((w[i] ?? NaN) - 0.1 * (gw[i] ?? NaN), 12);
      }
    }
    for (let l = 0; l < p.biases.length; l++) {
      const b = p.biases[l];
      const gb = g.biases[l];
      const nb = next.biases[l];
      if (!b || !gb || !nb) throw new Error("missing layer");
      expect(nb).not.toBe(b);
      for (let i = 0; i < b.length; i++) {
        expect(nb[i]).toBeCloseTo((b[i] ?? NaN) - 0.1 * (gb[i] ?? NaN), 12);
      }
    }
    expect(p.weights.map((w) => [...w])).toEqual(before);
  });
});

describe("training on xor", () => {
  it("decreases the loss strictly over the first 20 epochs", () => {
    let p = initParams(xor.startSeed);
    let previous = loss(p, xor);
    for (let epoch = 0; epoch < 20; epoch++) {
      p = step(p, gradients(p, xor), 0.1);
      const current = loss(p, xor);
      expect(current).toBeLessThan(previous);
      previous = current;
    }
  });

  it("reaches accuracy ≥ 0.9 within 300 epochs", () => {
    expect(accuracy(train(xor.startSeed, 300), xor)).toBeGreaterThanOrEqual(0.9);
  });
});

describe("accuracy", () => {
  it("counts a prediction of exactly 0 as wrong", () => {
    const zero: Params = {
      weights: [new Float64Array(8), new Float64Array(16), new Float64Array(4)],
      biases: [new Float64Array(4), new Float64Array(4), new Float64Array(1)],
    };
    expect(predict(zero, [1, 1])).toBe(0);
    expect(accuracy(zero, xor)).toBe(0);
  });
});

describe("boundaryGrid", () => {
  it("covers the domain row-major with x and y increasing", () => {
    const p = initParams(1);
    const grid = boundaryGrid(p, 8);
    expect(grid.length).toBe(64);
    for (const v of grid) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(grid[0]).toBeCloseTo(predict(p, [DOMAIN[0], DOMAIN[0]]), 6);
    expect(grid[7]).toBeCloseTo(predict(p, [DOMAIN[1], DOMAIN[0]]), 6);
    expect(grid[8]).not.toBe(grid[0]);
  });

  it("rejects a grid too small to have a step", () => {
    expect(() => boundaryGrid(initParams(1), 1)).toThrow(/n >= 2/);
  });

  it("defaults to a 40 × 40 grid", () => {
    expect(boundaryGrid(initParams(1)).length).toBe(1600);
  });
});
