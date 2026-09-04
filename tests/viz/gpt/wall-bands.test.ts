import { describe, expect, it } from "vitest";
import { BAND_Z, type BandKey, WALL_W } from "../../../src/viz/gpt/layout";
import { createWallBands, DIM_OPACITY } from "../../../src/viz/gpt/wall-bands";
import { testTheme } from "./helpers";

const BANDS = Object.keys(BAND_Z) as readonly BandKey[];

function make() {
  const { theme, repaint } = testTheme();
  return { bands: createWallBands(theme), theme, repaint };
}

/** The two endpoints of a band's line, as [x, y, z] pairs. */
function endpointsOf(positions: Float32Array): readonly (readonly number[])[] {
  return [
    [positions[0]!, positions[1]!, positions[2]!],
    [positions[3]!, positions[4]!, positions[5]!],
  ];
}

describe("createWallBands", () => {
  it("draws one horizontal line per band, spanning the wall at the band's z", () => {
    const { bands } = make();
    expect(Object.keys(bands.layers)).toEqual(BANDS);
    for (const band of BANDS) {
      const layer = bands.layers[band];
      const [a, b] = endpointsOf(layer.positions);
      expect(a![0]).toBeCloseTo(-WALL_W / 2, 6);
      expect(b![0]).toBeCloseTo(WALL_W / 2, 6);
      expect(a![2]).toBeCloseTo(BAND_Z[band], 6);
      expect(b![2]).toBeCloseTo(BAND_Z[band], 6);
      // Lifted toward the camera, which is at -y, so the line clears the wall.
      expect(a![1]).toBeLessThan(0);
      expect(a![1]).toBeCloseTo(b![1]!, 9);
      expect(layer.object.visible).toBe(true);
    }
    bands.dispose();
  });

  it("draws the bands in --soft, which is what reads on the translucent wall", () => {
    const { bands, theme } = make();
    for (const band of BANDS) {
      expect(bands.layers[band].material.color.getHex()).toBe(theme.soft.getHex());
    }
    bands.dispose();
  });

  it("leaves the focused band lit and dims the other four", () => {
    const { bands } = make();
    bands.setFocus("mlp");
    for (const band of BANDS) {
      expect(bands.layers[band].material.opacity).toBeCloseTo(band === "mlp" ? 1 : DIM_OPACITY, 9);
    }
    bands.dispose();
  });

  it("focuses the attention band for each of the three attention stages", () => {
    const { bands } = make();
    for (const stage of ["scores", "softmax", "weighted"] as const) {
      bands.setFocus(stage);
      expect(bands.layers.attention.material.opacity).toBeCloseTo(1, 9);
      expect(bands.layers.embed.material.opacity).toBeCloseTo(DIM_OPACITY, 9);
    }
    bands.dispose();
  });

  it("restores every band at 'all'", () => {
    const { bands } = make();
    bands.setFocus("logits");
    bands.setFocus("all");
    for (const band of BANDS) expect(bands.layers[band].material.opacity).toBeCloseTo(1, 9);
    bands.dispose();
  });

  it("recolours on a theme change", () => {
    const { bands, repaint } = make();
    repaint("--soft", "#0a0b0c");
    for (const band of BANDS) {
      expect(bands.layers[band].material.color.getHex()).toBe(0x0a0b0c);
    }
    bands.dispose();
  });

  it("releases its layers and stops listening on dispose", () => {
    const { bands, repaint } = make();
    const before = bands.layers.embed.material.color.getHex();
    bands.dispose();
    expect(bands.group.children).toHaveLength(0);
    repaint("--soft", "#0a0b0c");
    expect(bands.layers.embed.material.color.getHex()).toBe(before);
  });
});
