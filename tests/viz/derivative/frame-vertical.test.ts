import { describe, expect, it } from "vitest";
import { frameVertical } from "../../../src/viz/derivative/frame-vertical";

describe("frameVertical", () => {
  it("looks straight along +y at the centre of the drawn Z range", () => {
    const { position, target } = frameVertical();
    expect(target).toEqual([0, 0, -2.75]);
    expect(position[0]).toBe(0);
    expect(position[2]).toBe(-2.75);
  });

  it("stands the camera far enough back to fit the half-height of 5.75", () => {
    const { position } = frameVertical();
    expect(position[1]).toBeCloseTo(-15.964, 3);
  });
});
