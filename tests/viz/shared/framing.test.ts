import { describe, expect, it } from "vitest";
import { SURFACES } from "../../../src/core/math/surfaces";
import { frameFor } from "../../../src/viz/gradient-descent/framing";

describe("frameFor", () => {
  it("frames the bowl from its domain centre and height range", () => {
    const { position, target } = frameFor(SURFACES.bowl, [0, 3]);
    expect(target).toEqual([0, 0, 1.5]);
    expect(position[0]).toBeCloseTo(6, 10);
    expect(position[1]).toBeCloseTo(-6.9, 10);
    expect(position[2]).toBeCloseTo(6.6, 10);
  });

  it("centres on the domain of an off-centre surface", () => {
    const { target } = frameFor(SURFACES.rosenbrock, [0, 4]);
    expect(target[0]).toBeCloseTo(0, 10);
    expect(target[1]).toBeCloseTo(1, 10);
    expect(target[2]).toBeCloseTo(2, 10);
  });

  it("uses the larger half-extent of the two axes", () => {
    const wide = { ...SURFACES.bowl, domain: { x: [-5, 5], y: [-1, 1] } } as const;
    const { position, target } = frameFor(wide, [0, 0]);
    expect(target).toEqual([0, 0, 0]);
    expect(position[0]).toBeCloseTo(10, 10);
  });

  it("offsets the camera from the target, not from the origin", () => {
    const { position, target } = frameFor(SURFACES.rosenbrock, [0, 4]);
    expect(position[1] - target[1]).toBeCloseTo(-2 * 2.3, 10);
  });
});
