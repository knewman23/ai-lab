import { describe, expect, it } from "vitest";
import type { Vec2 } from "../../../src/core/math/numeric";
import { EMBEDDING_PRESETS, forward, SEQUENCES } from "../../../src/core/math/transformer";
import type { Segment, Vec3 } from "../../../src/viz/shared/layer";
import {
  arrowSegments,
  bandPoint,
  columnSegments,
  columnStem,
  GLYPH_BANDS,
} from "../../../src/viz/gpt/columns-geometry";
import { BAND_Z, columnX, glyphLength } from "../../../src/viz/gpt/layout";

const PASS = forward({
  embeddings: EMBEDDING_PRESETS.tuned,
  sequence: SEQUENCES["cat-sat"],
  positional: true,
  causal: true,
});

/** The vector of `a` minus `b`, for direction assertions. */
function delta(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function length3(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

/** True when the two endpoints coincide, in either order. */
function joins(segment: Segment, a: Vec3, b: Vec3): boolean {
  const same = (p: Vec3, q: Vec3): boolean => length3(delta(p, q)) < 1e-9;
  return (
    (same(segment[0], a) && same(segment[1], b)) || (same(segment[0], b) && same(segment[1], a))
  );
}

const BANDS = GLYPH_BANDS.map((g) => g.band);

const AT: Vec3 = [1, -0.02, 2.5];
const V: Vec2 = [0.6, -0.8];

describe("columnStem", () => {
  it("runs up column i from the embed band to the MLP band, lifted off the wall", () => {
    for (let i = 0; i < 5; i++) {
      const [a, b] = columnStem(i);
      expect(a[0]).toBeCloseTo(columnX(i), 9);
      expect(b[0]).toBeCloseTo(columnX(i), 9);
      expect(a[2]).toBeCloseTo(BAND_Z.embed, 9);
      expect(b[2]).toBeCloseTo(BAND_Z.mlp, 9);
      expect(a[1]).toBeLessThan(0);
      expect(a[1]).toBeCloseTo(b[1], 9);
    }
  });
});

describe("bandPoint", () => {
  it("is the column's x at the band's z, on the columns' lift", () => {
    const p = bandPoint(3, "logits");
    expect(p[0]).toBeCloseTo(columnX(3), 9);
    expect(p[2]).toBeCloseTo(BAND_Z.logits, 9);
    expect(p[1]).toBeCloseTo(columnStem(3)[0][1], 9);
  });
});

describe("arrowSegments", () => {
  it("points along the vector at glyphLength(|v|), starting at the band point", () => {
    const [shaft] = arrowSegments(AT, V, "closed");
    const magnitude = Math.hypot(V[0], V[1]);
    expect(shaft![0]).toEqual(AT);
    const along = delta(shaft![1], AT);
    expect(length3(along)).toBeCloseTo(glyphLength(magnitude), 9);
    // Direction: the vector's own, with y mapped to the wall's z.
    expect(along[0] / along[2]).toBeCloseTo(V[0] / V[1], 9);
    expect(Math.sign(along[0])).toBe(Math.sign(V[0]));
    expect(along[1]).toBeCloseTo(0, 9);
  });

  it("stays in the wall plane so a glyph never leaves the band it belongs to", () => {
    for (const segment of arrowSegments(AT, V, "open")) {
      for (const point of segment) expect(point[1]).toBeCloseTo(AT[1], 9);
    }
  });

  it("gives an open head two barbs off the tip, swept back along the shaft", () => {
    const segments = arrowSegments(AT, V, "open");
    expect(segments).toHaveLength(3);
    const tip = segments[0]![1];
    const along = delta(tip, AT);
    for (const barb of segments.slice(1)) {
      expect(barb[0]).toEqual(tip);
      const back = delta(barb[1], tip);
      // Swept back: the barb has a component against the shaft's direction.
      expect(back[0] * along[0] + back[2] * along[2]).toBeLessThan(0);
      expect(length3(back)).toBeLessThan(length3(along));
    }
    // The two barbs lie on opposite sides of the shaft.
    const cross = (b: Segment): number => {
      const back = delta(b[1], tip);
      return along[0] * back[2] - along[2] * back[0];
    };
    expect(Math.sign(cross(segments[1]!))).toBe(-Math.sign(cross(segments[2]!)));
  });

  it("closes a closed head by joining the two barb ends, so the two kinds differ", () => {
    const open = arrowSegments(AT, V, "open");
    const closed = arrowSegments(AT, V, "closed");
    expect(closed.slice(0, 3)).toEqual(open);
    expect(closed).toHaveLength(4);
    const [, first, second] = open;
    expect(joins(closed[3]!, first![1], second![1])).toBe(true);
  });

  it("draws nothing for a zero vector, which has no direction to point in", () => {
    expect(arrowSegments(AT, [0, 0], "closed")).toEqual([]);
  });
});

describe("GLYPH_BANDS", () => {
  it("is the spec's five-row table: three stream states and two deltas", () => {
    expect(GLYPH_BANDS.map((g) => [g.band, g.field, g.head])).toEqual([
      ["embed", "x", "closed"],
      ["attention", "attnOut", "open"],
      ["residual", "xResid", "closed"],
      ["mlp", "mlpOut", "open"],
      ["logits", "xFinal", "closed"],
    ]);
  });
});

describe("columnSegments", () => {
  it("is the stem plus one glyph per band, each from the pass's own vector", () => {
    const i = 2;
    const segments = columnSegments(PASS, i);
    expect(segments[0]).toEqual(columnStem(i));

    let n = 1;
    for (const { band, field, head } of GLYPH_BANDS) {
      const v = PASS[field][i]!;
      const expected = arrowSegments(bandPoint(i, band), [v[0]!, v[1]!], head);
      expect(expected.length).toBeGreaterThan(0);
      expect(segments.slice(n, n + expected.length)).toEqual(expected);
      n += expected.length;
    }
    expect(segments).toHaveLength(n);
  });

  it("gives the two delta bands open heads and the three stream bands closed ones", () => {
    const i = 2;
    const segments = columnSegments(PASS, i);
    /** Where each band's shaft starts, past the stem — which also begins at the embed band. */
    const starts = BANDS.map((band) => {
      const at = bandPoint(i, band);
      const n = segments.slice(1).findIndex((s) => length3(delta(s[0], at)) < 1e-9);
      expect(n).toBeGreaterThanOrEqual(0);
      return n + 1;
    });
    const sizes = starts.map((n, b) => {
      const next = starts[b + 1];
      return (next === undefined ? segments.length : next) - n;
    });
    // Three segments is a shaft and two barbs; the fourth closes the head.
    expect(BANDS.map((band, b) => [band, sizes[b]])).toEqual([
      ["embed", 4],
      ["attention", 3],
      ["residual", 4],
      ["mlp", 3],
      ["logits", 4],
    ]);
  });

  it("throws for a column outside the sequence rather than drawing a stray stem", () => {
    expect(() => columnSegments(PASS, PASS.x.length)).toThrow(/column/);
  });
});
