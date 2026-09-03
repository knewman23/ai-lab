import { describe, expect, it } from "vitest";
import { SURFACES } from "../../../src/core/math/surfaces";
import { frameFor } from "../../../src/viz/shared/framing";

describe("frameFor", () => {
  it("frames the bowl from its domain centre and height range", () => {
    const { position, target } = frameFor(SURFACES.bowl.domain, [0, 3]);
    expect(target).toEqual([0, 0, 1.5]);
    expect(position[0]).toBeCloseTo(6, 10);
    expect(position[1]).toBeCloseTo(-6.9, 10);
    expect(position[2]).toBeCloseTo(6.6, 10);
  });

  it("centres on the domain of an off-centre surface", () => {
    const { target } = frameFor(SURFACES.rosenbrock.domain, [0, 4]);
    expect(target[0]).toBeCloseTo(0, 10);
    expect(target[1]).toBeCloseTo(1, 10);
    expect(target[2]).toBeCloseTo(2, 10);
  });

  it("uses the larger half-extent of the two axes", () => {
    const { position, target } = frameFor({ x: [-5, 5], y: [-1, 1] }, [0, 0]);
    expect(target).toEqual([0, 0, 0]);
    expect(position[0]).toBeCloseTo(10, 10);
  });

  it("scales the offset by the half-extent of a square domain", () => {
    const { position, target } = frameFor({ x: [-5, 5], y: [-5, 5] }, [0, 0]);
    expect(target).toEqual([0, 0, 0]);
    expect(position[0]).toBeCloseTo(10, 10);
    expect(position[1]).toBeCloseTo(-11.5, 10);
    expect(position[2]).toBeCloseTo(8.5, 10);
  });

  it("offsets the camera from the target, not from the origin", () => {
    const { position, target } = frameFor(SURFACES.rosenbrock.domain, [0, 4]);
    expect(position[1] - target[1]).toBeCloseTo(-2 * 2.3, 10);
  });
});
