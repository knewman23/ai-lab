import { describe, expect, it } from "vitest";
import { SIZES } from "../../../src/core/math/mlp";
import {
  FLOOR_CY,
  FLOOR_SIZE,
  LIFT_WALL,
  WALL_H,
  WALL_W,
  floorPoint,
  inputFromFloor,
  neuronPosition,
} from "../../../src/viz/nn/layout";

describe("nn layout", () => {
  it("exports the wall and floor dimensions", () => {
    expect(WALL_W).toBe(10);
    expect(WALL_H).toBe(6);
    expect(FLOOR_SIZE).toBe(6);
    expect(FLOOR_CY).toBe(-3.5);
    expect(LIFT_WALL).toEqual([0, -0.01, 0]);
  });

  it("the four layer columns sit at X = -3.75, -1.25, 1.25, 3.75", () => {
    const xs = SIZES.map((_, l) => neuronPosition(l, 0)[0]);
    expect(xs).toHaveLength(4);
    [-3.75, -1.25, 1.25, 3.75].forEach((x, l) => expect(xs[l]).toBeCloseTo(x));
  });

  it("the input pair sits at Z 5.2 and 0.8", () => {
    expect(neuronPosition(0, 0)[1]).toBeCloseTo(5.2);
    expect(neuronPosition(0, 1)[1]).toBeCloseTo(0.8);
  });

  it("a hidden layer of four spreads Z 5.2 -> 0.8 evenly", () => {
    const zs = [0, 1, 2, 3].map((i) => neuronPosition(1, i)[1]);
    [5.2, 3.7333, 2.2667, 0.8].forEach((z, i) => expect(zs[i]).toBeCloseTo(z, 3));
    expect([0, 1, 2, 3].map((i) => neuronPosition(2, i)[1])).toEqual(zs);
  });

  it("the single output neuron sits at Z = 3", () => {
    expect(neuronPosition(3, 0)[1]).toBeCloseTo(3);
  });

  it("floorPoint maps the input domain onto the floor plane z = 0", () => {
    expect(floorPoint([0, 0])).toEqual([0, -3.5, 0]);
    expect(floorPoint([-3, -3])).toEqual([-3, -6.5, 0]);
    expect(floorPoint([3, 3])).toEqual([3, -0.5, 0]);
  });

  it("inputFromFloor inverts floorPoint", () => {
    for (const p of [
      [0, 0],
      [-3, -3],
      [3, 3],
      [1.25, -2.5],
    ] as const) {
      const [x, y] = floorPoint(p);
      const back = inputFromFloor([x, y]);
      expect(back[0]).toBeCloseTo(p[0]);
      expect(back[1]).toBeCloseTo(p[1]);
    }
  });

  it("inputFromFloor does not clamp; setProbe owns that", () => {
    expect(inputFromFloor([9, 0])).toEqual([9, 3.5]);
  });
});
