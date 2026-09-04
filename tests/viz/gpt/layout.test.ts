import { describe, expect, it } from "vitest";
import type { Vec2 } from "../../../src/core/math/numeric";
import {
  BAND_Z,
  bandForStage,
  COLUMN_X,
  EMBED_DOMAIN,
  FLOOR_X,
  FLOOR_Y,
  GLYPH_MAX,
  WALL_H,
  WALL_OPACITY,
  WALL_W,
  columnX,
  embedFromFloor,
  floorFromEmbed,
  glyphLength,
} from "../../../src/viz/gpt/layout";

/** The domain's four corners and its centre: what the round-trip is checked over. */
const DOMAIN_POINTS: readonly Vec2[] = [
  [-2, -2],
  [-2, 2],
  [2, -2],
  [2, 2],
  [0, 0],
];

describe("gpt layout", () => {
  it("exports the wall's size and opacity", () => {
    expect(WALL_W).toBe(6);
    expect(WALL_H).toBe(5.2);
    expect(WALL_OPACITY).toBe(0.18);
  });

  it("spreads the five token columns across the wall at a pitch of 1.2", () => {
    expect(COLUMN_X).toEqual([-2.4, -1.2, 0, 1.2, 2.4]);
    expect([0, 1, 2, 3, 4].map(columnX)).toEqual([...COLUMN_X]);
    expect(() => columnX(5)).toThrow(/column/);
    expect(() => columnX(-1)).toThrow(/column/);
  });

  it("stacks the five stage bands from embed at 0.5 to logits at 4.2", () => {
    expect(BAND_Z).toEqual({ embed: 0.5, attention: 1.5, residual: 2.5, mlp: 3.4, logits: 4.2 });
  });

  // The tallest bar rises GLYPH_MAX above the logits band; that plus a label pill must fit.
  it("leaves room above the logits band for the tallest probability bar", () => {
    expect(BAND_Z.logits + GLYPH_MAX).toBeLessThan(WALL_H);
  });

  it("maps the embedding domain onto the floor with a margin on every side", () => {
    expect(EMBED_DOMAIN).toEqual([-2, 2]);
    expect(FLOOR_X).toEqual([-3, 3]);
    expect(FLOOR_Y).toEqual([-6, 0]);
    expect(floorFromEmbed([0, 0])).toEqual([0, -3]);
    for (const [e, floor] of [
      [
        [-2, -2],
        [-2.8, -5.8],
      ],
      [
        [2, 2],
        [2.8, -0.2],
      ],
    ] as const) {
      const p = floorFromEmbed(e);
      expect(p[0]).toBeCloseTo(floor[0], 12);
      expect(p[1]).toBeCloseTo(floor[1], 12);
    }
  });

  it("round-trips the domain's corners and centre to 1e-12", () => {
    for (const e of DOMAIN_POINTS) {
      const back = embedFromFloor(floorFromEmbed(e));
      expect(back[0]).toBeCloseTo(e[0], 12);
      expect(back[1]).toBeCloseTo(e[1], 12);
    }
  });

  it("clamps a floor point outside the domain back into [-2, 2]^2", () => {
    expect(embedFromFloor([9, 9])).toEqual([2, 2]);
    expect(embedFromFloor([-9, -9])).toEqual([-2, -2]);
    expect(embedFromFloor([0, -3])).toEqual([0, 0]);
  });

  it("glyphLength is 0 at 0 and strictly increasing over the magnitudes the scene draws", () => {
    expect(glyphLength(0)).toBe(0);
    let previous = 0;
    // Measured magnitudes across all presets, sentences and stages run 0.02 to 5.63; 20 is far
    // past that, and past it double-precision tanh saturates so the curve only stays monotone.
    for (let m = 0.02; m <= 20; m += 0.02) {
      const length = glyphLength(m);
      expect(length).toBeGreaterThan(previous);
      previous = length;
    }
  });

  it("glyphLength never exceeds the ceiling, and the ceiling clears the neighbouring column", () => {
    for (let m = 0; m <= 100; m += 0.05) expect(glyphLength(m)).toBeLessThanOrEqual(GLYPH_MAX);
    expect(glyphLength(5.63)).toBeLessThan(GLYPH_MAX);
    expect(GLYPH_MAX).toBe(0.55);
    // Under half the 1.2 column pitch, so an arrow can never touch its neighbour.
    expect(GLYPH_MAX).toBeLessThan(1.2 / 2);
  });

  // A calibration check, not a property: retuning the curve is expected to break these three,
  // and they should then be re-derived rather than loosened.
  it("separates the common magnitude range", () => {
    expect(glyphLength(1.6)).toBeCloseTo(0.3652, 3);
    expect(glyphLength(2.6)).toBeCloseTo(0.4739, 3);
    expect(glyphLength(5.6)).toBeCloseTo(0.5459, 3);
  });
});

describe("bandForStage", () => {
  it("sends every stage to the band it happens on, and 'all' to none", () => {
    expect(bandForStage("all")).toBeNull();
    expect(bandForStage("embed")).toBe("embed");
    expect(bandForStage("residual")).toBe("residual");
    expect(bandForStage("mlp")).toBe("mlp");
    expect(bandForStage("logits")).toBe("logits");
  });

  it("puts the scores, the softmax and the weighted sum on the one attention band", () => {
    for (const stage of ["scores", "softmax", "weighted"] as const) {
      expect(bandForStage(stage)).toBe("attention");
    }
  });
});
