import { describe, expect, it } from "vitest";
import { declutter, type LabelBox } from "../../../src/viz/shared/declutter";

/** A box `w` x `h` whose top-left corner is (`left`, `top`). */
function box(id: string, rank: number, left: number, top: number, w: number, h: number): LabelBox {
  return { id, rank, left, top, right: left + w, bottom: top + h };
}

/** The ids that were placed, in the order the pass placed them. */
function kept(places: ReadonlyMap<string, unknown>): string[] {
  return [...places.keys()];
}

describe("declutter", () => {
  it("leaves every box on its own point when none of them overlap", () => {
    const places = declutter([
      box("a", 3, 0, 0, 40, 16),
      box("b", 1, 100, 0, 40, 16),
      box("c", 2, 0, 100, 40, 16),
    ]);
    expect(kept(places).sort()).toEqual(["a", "b", "c"]);
    for (const id of ["a", "b", "c"]) expect(places.get(id)).toEqual({ dx: 0, dy: 0 });
  });

  it("moves the worse-ranked box of an overlapping pair a line up, whatever order it arrives in", () => {
    const near = box("near", 4, 10, 10, 40, 16);
    const far = box("far", 0, 30, 18, 40, 16);
    for (const given of [
      [near, far],
      [far, near],
    ]) {
      const places = declutter(given);
      expect(places.get("far")).toEqual({ dx: 0, dy: 0 });
      expect(places.get("near")).toEqual({ dx: 0, dy: -16 });
    }
  });

  it("tries below, then left, then right once the line above is taken too", () => {
    // Three blockers pin the point, the line above it and the line below it.
    const blockers = [
      box("on", 0, 100, 100, 40, 16),
      box("above", 0, 100, 84, 40, 16),
      box("below", 0, 100, 116, 40, 16),
    ];
    const left = declutter([...blockers, box("crowded", 1, 100, 100, 40, 16)]);
    expect(left.get("crowded")).toEqual({ dx: -40, dy: 0 });

    const pinned = box("pinned", 0, 84, 100, 40, 16);
    const right = declutter([...blockers, pinned, box("crowded", 1, 100, 100, 40, 16)]);
    expect(right.get("crowded")).toEqual({ dx: 40, dy: 0 });
  });

  it("leaves a box out when every candidate place is taken", () => {
    const wall = box("wall", 0, 0, 0, 400, 400);
    const places = declutter([wall, box("buried", 1, 180, 180, 40, 16)]);
    expect(kept(places)).toEqual(["wall"]);
    expect(places.has("buried")).toBe(false);
  });

  it("holds the place a box moved to against the boxes that come after it", () => {
    const first = box("first", 0, 0, 0, 40, 16);
    const moved = box("moved", 1, 20, 0, 40, 16);
    // `moved` steps up to y −16, so `after` wanting that same line must step somewhere else.
    const after = box("after", 2, 30, -16, 40, 16);
    const places = declutter([first, moved, after]);
    expect(places.get("moved")).toEqual({ dx: 0, dy: -16 });
    expect(places.get("after")).toEqual({ dx: 0, dy: -16 });
  });

  it("counts a shared edge as clear, so labels may sit flush against each other", () => {
    const places = declutter([box("left", 0, 0, 0, 40, 16), box("right", 1, 40, 0, 40, 16)]);
    expect(kept(places).sort()).toEqual(["left", "right"]);
    expect(places.get("right")).toEqual({ dx: 0, dy: 0 });
  });

  it("frees the space a dropped box wanted, so a later box may still take part of it", () => {
    const wall = box("wall", 0, 0, 0, 400, 400);
    const places = declutter([
      wall,
      box("buried", 1, 180, 180, 40, 16),
      box("clear", 2, 0, 500, 40, 16),
    ]);
    expect(kept(places)).toEqual(["wall", "clear"]);
  });

  it("breaks a tie on rank by the order the boxes were given, both ways round", () => {
    const first = box("first", 2, 0, 0, 40, 16);
    const second = box("second", 2, 20, 0, 40, 16);
    expect(declutter([first, second]).get("first")).toEqual({ dx: 0, dy: 0 });
    expect(declutter([first, second]).get("second")).toEqual({ dx: 0, dy: -16 });
    expect(declutter([second, first]).get("second")).toEqual({ dx: 0, dy: 0 });
    expect(declutter([second, first]).get("first")).toEqual({ dx: 0, dy: -16 });
  });

  it("steps by the box's own size, so a taller label moves further up", () => {
    const tall = declutter([box("under", 0, 0, 0, 40, 40), box("over", 1, 20, 0, 40, 40)]);
    expect(tall.get("over")).toEqual({ dx: 0, dy: -40 });
  });

  it("steps sideways by the box's own width, which is what it takes to clear its old place", () => {
    // The line above and the line below are held, so the only way out is sideways.
    const held = [
      box("on", 0, 0, 0, 100, 16),
      box("above", 0, 0, -16, 100, 16),
      box("below", 0, 0, 16, 100, 16),
    ];
    expect(declutter([...held, box("wide", 1, 0, 0, 100, 16)]).get("wide")).toEqual({
      dx: -100,
      dy: 0,
    });
  });

  it("returns nothing for nothing", () => {
    expect(kept(declutter([]))).toEqual([]);
  });
});
