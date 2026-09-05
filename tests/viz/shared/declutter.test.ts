import { describe, expect, it } from "vitest";
import { declutter, type LabelBox } from "../../../src/viz/shared/declutter";

/** A box `w` x `h` whose top-left corner is (`left`, `top`). */
function box(id: string, rank: number, left: number, top: number, w: number, h: number): LabelBox {
  return { id, rank, left, top, right: left + w, bottom: top + h };
}

describe("declutter", () => {
  it("keeps every box when none of them overlap", () => {
    const kept = declutter([
      box("a", 3, 0, 0, 40, 16),
      box("b", 1, 100, 0, 40, 16),
      box("c", 2, 0, 100, 40, 16),
    ]);
    expect([...kept].sort()).toEqual(["a", "b", "c"]);
  });

  it("drops the higher-ranked box of an overlapping pair whatever order it arrives in", () => {
    const near = box("near", 4, 10, 10, 40, 16);
    const far = box("far", 0, 30, 18, 40, 16);
    expect([...declutter([near, far])]).toEqual(["far"]);
    expect([...declutter([far, near])]).toEqual(["far"]);
  });

  it("counts a shared edge as clear, so labels may sit flush against each other", () => {
    const kept = declutter([box("left", 0, 0, 0, 40, 16), box("right", 1, 40, 0, 40, 16)]);
    expect([...kept].sort()).toEqual(["left", "right"]);
  });

  it("frees the space a dropped box wanted, so a third box may still take part of it", () => {
    // b is dropped for overlapping a; c overlaps b but not a, so nothing stands in its way.
    const kept = declutter([
      box("a", 0, 0, 0, 40, 16),
      box("b", 1, 30, 0, 40, 16),
      box("c", 2, 60, 0, 40, 16),
    ]);
    expect([...kept].sort()).toEqual(["a", "c"]);
  });

  it("breaks a tie on rank by the order the boxes were given, both ways round", () => {
    const first = box("first", 2, 0, 0, 40, 16);
    const second = box("second", 2, 20, 0, 40, 16);
    expect([...declutter([first, second])]).toEqual(["first"]);
    expect([...declutter([second, first])]).toEqual(["second"]);
  });

  it("returns nothing for nothing", () => {
    expect([...declutter([])]).toEqual([]);
  });
});
