import { describe, expect, it } from "vitest";
import type { Vec2 } from "../../../src/core/math/numeric";
import { isFinitePoint, magnitude } from "../../../src/core/math/numeric";
import { SURFACES } from "../../../src/core/math/surfaces";
import {
  OPTIMIZER_KEYS,
  OPTIMIZERS,
  getOptimizer,
  type AnyOptimizer,
} from "../../../src/core/math/optimizers";

describe("OPTIMIZER_KEYS", () => {
  it("is sgd, momentum, adam in that order", () => {
    expect(OPTIMIZER_KEYS).toEqual(["sgd", "momentum", "adam"]);
  });
});

describe("convergence on bowl", () => {
  const budgets = { sgd: 50, momentum: 140, adam: 200 };

  for (const key of OPTIMIZER_KEYS) {
    it(`${key} converges (|grad| < 1e-3) within budget from bowl start`, () => {
      const optimizer: AnyOptimizer = getOptimizer(key);
      const surface = SURFACES.bowl;
      const lr = 0.1;
      let pos: Vec2 = surface.start;
      let state: unknown = optimizer.init();
      let steps = 0;
      const maxSteps = 200;
      let converged = false;
      for (steps = 1; steps <= maxSteps; steps++) {
        const grad = surface.grad(pos[0], pos[1]);
        const result = optimizer.step(pos, grad, lr, state);
        pos = result.pos;
        state = result.state;
        const nextGrad = surface.grad(pos[0], pos[1]);
        if (magnitude(nextGrad) < 1e-3) {
          converged = true;
          break;
        }
      }
      expect(converged).toBe(true);
      expect(steps).toBeLessThanOrEqual(budgets[key]);
    });
  }
});

describe("Adam closed-form check", () => {
  it("matches the paper's update for the first three steps", () => {
    const surface = SURFACES.bowl;
    const lr = 0.1;
    const beta1 = 0.9;
    const beta2 = 0.999;
    const eps = 1e-8;

    let pos: Vec2 = [1, 1];
    let m: Vec2 = [0, 0];
    let v: Vec2 = [0, 0];

    const optimizer = OPTIMIZERS.adam;
    let state = optimizer.init();

    for (let t = 1; t <= 3; t++) {
      const grad = surface.grad(pos[0], pos[1]);

      // Reference closed-form computation.
      const mNew: Vec2 = [
        beta1 * m[0] + (1 - beta1) * grad[0],
        beta1 * m[1] + (1 - beta1) * grad[1],
      ];
      const vNew: Vec2 = [
        beta2 * v[0] + (1 - beta2) * grad[0] * grad[0],
        beta2 * v[1] + (1 - beta2) * grad[1] * grad[1],
      ];
      const mHat: Vec2 = [mNew[0] / (1 - beta1 ** t), mNew[1] / (1 - beta1 ** t)];
      const vHat: Vec2 = [vNew[0] / (1 - beta2 ** t), vNew[1] / (1 - beta2 ** t)];
      const expectedPos: Vec2 = [
        pos[0] - (lr * mHat[0]) / (Math.sqrt(vHat[0]) + eps),
        pos[1] - (lr * mHat[1]) / (Math.sqrt(vHat[1]) + eps),
      ];

      const result = optimizer.step(pos, grad, lr, state);

      expect(result.pos[0]).toBeCloseTo(expectedPos[0], 12);
      expect(result.pos[1]).toBeCloseTo(expectedPos[1], 12);

      pos = result.pos;
      state = result.state;
      m = mNew;
      v = vNew;
    }
  });
});

describe("momentum matches SGD on first step", () => {
  it("velocity starts at zero, so step one equals plain SGD", () => {
    const surface = SURFACES.bowl;
    const lr = 0.1;
    const pos: Vec2 = surface.start;
    const grad = surface.grad(pos[0], pos[1]);

    const sgdResult = OPTIMIZERS.sgd.step(pos, grad, lr, OPTIMIZERS.sgd.init());
    const momentumResult = OPTIMIZERS.momentum.step(pos, grad, lr, OPTIMIZERS.momentum.init());

    expect(momentumResult.pos[0]).toBeCloseTo(sgdResult.pos[0], 12);
    expect(momentumResult.pos[1]).toBeCloseTo(sgdResult.pos[1], 12);
  });
});

describe("divergence handling", () => {
  it("returns a non-finite position instead of throwing for a diverging run", () => {
    const surface = SURFACES.rosenbrock;
    const lr = 1;
    let pos: Vec2 = surface.start;
    let state = OPTIMIZERS.sgd.init();

    expect(() => {
      for (let i = 0; i < 50; i++) {
        const grad = surface.grad(pos[0], pos[1]);
        const result = OPTIMIZERS.sgd.step(pos, grad, lr, state);
        pos = result.pos;
        state = result.state;
      }
    }).not.toThrow();

    expect(isFinitePoint(pos)).toBe(false);
  });
});

describe("immutability", () => {
  for (const key of OPTIMIZER_KEYS) {
    it(`${key}.step does not mutate its inputs`, () => {
      const optimizer: AnyOptimizer = getOptimizer(key);
      const surface = SURFACES.bowl;
      const pos = Object.freeze(surface.start.slice()) as Vec2;
      const grad = Object.freeze(surface.grad(pos[0], pos[1]).slice()) as Vec2;
      const state = Object.freeze(optimizer.init());

      expect(() => {
        optimizer.step(pos, grad, 0.1, state);
      }).not.toThrow();
    });
  }
});

describe("equation", () => {
  for (const key of OPTIMIZER_KEYS) {
    it(`${key}.equation(0.1) substitutes lr and is non-empty`, () => {
      const eq = OPTIMIZERS[key].equation(0.1);
      expect(eq.length).toBeGreaterThan(0);
      expect(eq).toContain("0.1");
    });
  }
});

describe("getOptimizer", () => {
  it("returns a type-erased accessor usable generically", () => {
    for (const key of OPTIMIZER_KEYS) {
      const optimizer: AnyOptimizer = getOptimizer(key);
      expect(optimizer.key).toBe(key);
      expect(typeof optimizer.step).toBe("function");
    }
  });
});
