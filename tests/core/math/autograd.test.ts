import { describe, expect, it } from "vitest";
import {
  backward,
  forward,
  gradsAfter,
  localGrad,
  passSteps,
  revealed,
  starts,
  topoOrder,
} from "../../../src/core/math/autograd";
import { GRAPHS } from "../../../src/core/math/graphs";

const neuron = GRAPHS.neuron;
const productSum = GRAPHS["product-sum"];
const shared = GRAPHS["shared-node"];

const NEURON_LEAVES = ["x1", "w1", "x2", "w2", "b"];
const NEURON_ALL = [...NEURON_LEAVES, "x1w1", "x2w2", "sum", "n", "o"];

/** The notebook's gradients for the neuron at its starting values. */
const NEURON_GRADS = {
  o: 1,
  n: 0.5,
  sum: 0.5,
  b: 0.5,
  x1w1: 0.5,
  x2w2: 0.5,
  x1: -1.5,
  w1: 1.0,
  x2: 0.5,
  w2: 0,
};

function expectClose(actual: Readonly<Record<string, number>>, expected: Record<string, number>) {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const [id, v] of Object.entries(expected)) expect(actual[id]).toBeCloseTo(v, 4);
}

describe("starts", () => {
  it("maps every leaf to its start value", () => {
    expect(starts(productSum)).toEqual({ a: 2, b: -3, c: 10 });
  });
});

describe("topoOrder", () => {
  it("neuron: every input precedes its consumer, o is last, and the order is deterministic", () => {
    const order = topoOrder(neuron);
    expect(order).toHaveLength(10);
    expect(order[order.length - 1]).toBe("o");
    for (const n of neuron.nodes) {
      for (const input of n.inputs) {
        expect(order.indexOf(input)).toBeLessThan(order.indexOf(n.id));
      }
    }
    expect(topoOrder(neuron)).toEqual(order);
    expect(order).toEqual(["x1", "w1", "x1w1", "x2", "w2", "x2w2", "sum", "b", "n", "o"]);
  });

  it("shared-node: a, b, ab, c, e, f, L", () => {
    expect(topoOrder(shared)).toEqual(["a", "b", "ab", "c", "e", "f", "L"]);
  });
});

describe("forward", () => {
  it("neuron at the notebook's starts", () => {
    const v = forward(neuron, starts(neuron));
    expect(v.x1w1).toBe(-6);
    expect(v.x2w2).toBe(0);
    expect(v.sum).toBe(-6);
    expect(v.n).toBeCloseTo(0.8814, 4);
    expect(v.o).toBeCloseTo(0.7071, 4);
  });

  it("product-sum: d = 4", () => {
    expect(forward(productSum, starts(productSum)).d).toBe(4);
  });

  it("shared-node: ab −6, e 4, f 40, L 44", () => {
    const v = forward(shared, starts(shared));
    expect([v.ab, v.e, v.f, v.L]).toEqual([-6, 4, 40, 44]);
  });
});

describe("backward", () => {
  it("neuron: the notebook's gradients", () => {
    const values = forward(neuron, starts(neuron));
    expectClose(backward(neuron, values), NEURON_GRADS);
  });

  it("product-sum: a −3, b 2, c 1", () => {
    const grads = backward(productSum, forward(productSum, starts(productSum)));
    expect(grads).toEqual({ d: 1, ab: 1, c: 1, a: -3, b: 2 });
  });

  it("shared-node: e accumulates 1 from L and 10 from f", () => {
    const grads = backward(shared, forward(shared, starts(shared)));
    expect(grads).toEqual({ L: 1, f: 1, e: 11, ab: 11, c: 15, a: -33, b: 22 });
  });

  it("equals gradsAfter at the full count", () => {
    const values = forward(neuron, starts(neuron));
    expect(backward(neuron, values)).toEqual(gradsAfter(neuron, values, 5));
  });
});

describe("gradsAfter", () => {
  const values = forward(shared, starts(shared));
  const expected: Record<number, Record<string, number>> = {
    0: {},
    1: { L: 1, f: 1, e: 1 },
    2: { L: 1, f: 1, e: 11, c: 4 },
    3: { L: 1, f: 1, e: 11, c: 15, ab: 11 },
    4: { L: 1, f: 1, e: 11, c: 15, ab: 11, a: -33, b: 22 },
  };

  it("reveals a key only once a contribution has landed; e shows 1 then 11", () => {
    for (const [k, grads] of Object.entries(expected)) {
      expect(gradsAfter(shared, values, Number(k))).toEqual(grads);
    }
  });
});

describe("localGrad", () => {
  const values = forward(neuron, starts(neuron));

  it("tanh matches a central difference at n", () => {
    const h = 1e-5;
    const n = values.n ?? NaN;
    const expected = (Math.tanh(n + h) - Math.tanh(n - h)) / (2 * h);
    const actual = localGrad(neuron, "o", 0, values);
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * 1e-4);
  });

  it("add → 1 for either input", () => {
    expect(localGrad(neuron, "n", 0, values)).toBe(1);
    expect(localGrad(neuron, "n", 1, values)).toBe(1);
  });

  it("mul → the other input's value", () => {
    expect(localGrad(neuron, "x1w1", 0, values)).toBe(-3);
    expect(localGrad(neuron, "x1w1", 1, values)).toBe(2);
  });
});

describe("passSteps", () => {
  it("neuron: 5 forward steps in topo order, then 5 backward steps in reverse", () => {
    const steps = passSteps(neuron);
    expect(steps).toHaveLength(10);
    const nonLeaves = ["x1w1", "x2w2", "sum", "n", "o"];
    expect(steps.slice(0, 5)).toEqual(nonLeaves.map((node) => ({ kind: "forward", node })));
    expect(steps.slice(5)).toEqual(
      [...nonLeaves].reverse().map((node) => ({ kind: "backward", node })),
    );
  });

  it("product-sum has 4 steps; shared-node has 8 with backward order L, f, e, ab", () => {
    expect(passSteps(productSum)).toHaveLength(4);
    const steps = passSteps(shared);
    expect(steps).toHaveLength(8);
    expect(steps.slice(4).map((s) => s.node)).toEqual(["L", "f", "e", "ab"]);
  });
});

describe("revealed", () => {
  const values = forward(neuron, starts(neuron));

  it("k = 0: only the leaves, no backward steps", () => {
    expect(revealed(neuron, 0)).toEqual({ values: new Set(NEURON_LEAVES), backwardSteps: 0 });
  });

  it("k = 5: every value known, no backward steps", () => {
    expect(revealed(neuron, 5)).toEqual({ values: new Set(NEURON_ALL), backwardSteps: 0 });
  });

  it("k = 6 and 7: one and two backward steps reveal o, n then sum, b", () => {
    const r6 = revealed(neuron, 6);
    expect(r6.backwardSteps).toBe(1);
    expect(Object.keys(gradsAfter(neuron, values, r6.backwardSteps)).sort()).toEqual(["n", "o"]);
    const r7 = revealed(neuron, 7);
    expect(r7.backwardSteps).toBe(2);
    expect(Object.keys(gradsAfter(neuron, values, r7.backwardSteps)).sort()).toEqual(
      ["o", "n", "sum", "b"].sort(),
    );
  });

  it("k = 10: a complete pass with the notebook's gradients", () => {
    const r = revealed(neuron, 10);
    expect(r.values).toEqual(new Set(NEURON_ALL));
    expect(r.backwardSteps).toBe(5);
    expectClose(gradsAfter(neuron, values, r.backwardSteps), NEURON_GRADS);
  });
});
