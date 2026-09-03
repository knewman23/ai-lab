import { describe, expect, it } from "vitest";
import { FACES } from "../../../src/viz/shared/layer";
import { LIFT_FLOOR, LIFT_FRONT, LIFT_SIDE, liftOf, segment } from "../../../src/viz/shared/lift";

describe("liftOf", () => {
  it("puts the face's lift on its fixed axis and nothing elsewhere", () => {
    expect(liftOf(FACES.front)).toEqual([0, 0.01, 0]);
    expect(liftOf(FACES.side)).toEqual([0.01, 0, 0]);
    expect(liftOf(FACES.floor)).toEqual([0, 0, 0.01]);
  });

  it("backs the exported constants", () => {
    expect(LIFT_FRONT).toEqual(liftOf(FACES.front));
    expect(LIFT_SIDE).toEqual(liftOf(FACES.side));
    expect(LIFT_FLOOR).toEqual(liftOf(FACES.floor));
  });
});

describe("segment", () => {
  it("adds the sum of the lifts to both endpoints", () => {
    const [p, q] = segment([-3, 0, 0], [3, 0, 0], LIFT_FRONT, LIFT_FLOOR);
    expect(p).toEqual([-3, 0.01, 0.01]);
    expect(q).toEqual([3, 0.01, 0.01]);
  });

  it("leaves a segment alone with no lifts", () => {
    expect(segment([1, 2, 3], [4, 5, 6])).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });
});
