import { describe, expect, it } from "vitest";
import { GRAPHS } from "../../../src/core/math/graphs";
import { edgeLabel, GRAPH_TEX, passLine, stepText } from "../../../src/viz/backprop/explanation";
import { derived, initialState, setGraph, stepForward } from "../../../src/viz/backprop/state";
import type { BpState, Derived } from "../../../src/viz/backprop/state";

function at(step: number, s: BpState = initialState()): BpState {
  let out = s;
  for (let i = 0; i < step; i++) out = stepForward(out);
  return out;
}

function d(step: number, s?: BpState): Derived {
  return derived(at(step, s));
}

describe("stepText", () => {
  it("invites the first step before the pass starts", () => {
    expect(stepText(d(0))).toBe("Leaves are given; press Step to run the forward pass.");
  });

  it("describes a forward mul step with the node label and both inputs", () => {
    expect(stepText(d(1))).toBe("forward: x1·w1 = 2 × −3 = −6");
  });

  it("describes a forward add step", () => {
    expect(stepText(d(4))).toBe("forward: n = −6 + 6.881 = 0.8814");
  });

  it("describes a forward tanh step", () => {
    expect(stepText(d(5))).toBe("forward: o = tanh(0.8814) = 0.7071");
  });

  it("describes the output's backward step with ids and the local derivative", () => {
    expect(stepText(d(6))).toBe("backward at o: o.grad = 1 → n.grad += 0.5 × 1");
  });

  it("lists every input of an add node's backward step", () => {
    expect(stepText(d(7))).toBe(
      "backward at n: n.grad = 0.5 → sum.grad += 1 × 0.5, b.grad += 1 × 0.5",
    );
  });

  it("reports a complete pass", () => {
    expect(stepText(d(10))).toBe("Pass complete.");
    expect(stepText(d(4, setGraph(initialState(), "product-sum")))).toBe("Pass complete.");
  });
});

describe("edgeLabel", () => {
  const values = derived(initialState()).values;

  it("shows the partner's value on a mul edge", () => {
    expect(edgeLabel(GRAPHS.neuron, "x1w1", 0, values)).toBe("× −3");
    expect(edgeLabel(GRAPHS.neuron, "x1w1", 1, values)).toBe("× 2");
  });

  it("shows 1 on an add edge and 1 − tanh² on the tanh edge", () => {
    expect(edgeLabel(GRAPHS.neuron, "n", 1, values)).toBe("× 1");
    expect(edgeLabel(GRAPHS.neuron, "o", 0, values)).toBe("× 0.5");
  });
});

describe("passLine", () => {
  it("prefixes the step text with the position in the pass", () => {
    expect(passLine(0, d(0))).toBe(
      "Step 0 of 10: Leaves are given; press Step to run the forward pass.",
    );
    expect(passLine(1, d(1))).toBe("Step 1 of 10: forward: x1·w1 = 2 × −3 = −6");
    expect(passLine(10, d(10))).toBe("Step 10 of 10: Pass complete.");
  });
});

describe("GRAPH_TEX", () => {
  it("has an expression for every preset", () => {
    expect(GRAPH_TEX.neuron).toBe("o = \\tanh(x_1 w_1 + x_2 w_2 + b)");
    expect(GRAPH_TEX["product-sum"]).toBe("d = ab + c");
    expect(GRAPH_TEX["shared-node"]).toBe("L = ec + e,\\ e = ab + c");
  });
});
