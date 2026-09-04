import { Color, type MeshStandardMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import { DATASETS } from "../../../src/core/math/datasets";
import { createThemeColors } from "../../../src/core/theme";
import { floorPoint } from "../../../src/viz/nn/layout";
import { createPoints } from "../../../src/viz/nn/points";
import type { ThemeColors } from "../../../src/viz/types";

const TOKENS: Readonly<Record<string, string>> = {
  "--ink": "#112233",
  "--accent": "#aa2244",
};

/** The sphere radius, which is also how far the spheres stand off the floor plane. */
const RADIUS = 0.07;

/** Instance colours round-trip through a Float32Array, so `Color.equals` is too strict. */
function expectColour(actual: Color, expected: ThemeColors["ink"]): void {
  expect(actual.r).toBeCloseTo(expected.r, 5);
  expect(actual.g).toBeCloseTo(expected.g, 5);
  expect(actual.b).toBeCloseTo(expected.b, 5);
}

function make() {
  const theme = createThemeColors((token) => TOKENS[token] ?? "#010203");
  return { points: createPoints(theme), theme };
}

describe("createPoints", () => {
  it("draws one never-culled instance per point, standing on the floor", () => {
    const { points } = make();
    points.set(DATASETS.xor);
    expect(points.mesh.count).toBe(40);
    expect(points.mesh.frustumCulled).toBe(false);
    // `needsUpdate` is a write-only setter that bumps `version`.
    expect(points.mesh.instanceMatrix.version).toBeGreaterThan(0);

    const [x, y, z] = floorPoint(DATASETS.xor.points[0]!.x);
    const at = points.mesh.instanceMatrix.array;
    expect(at[12]).toBeCloseTo(x, 5);
    expect(at[13]).toBeCloseTo(y, 5);
    expect(at[14]).toBeCloseTo(z + RADIUS, 5);
    points.dispose();
  });

  it("colours each instance by its label's sign", () => {
    const { points, theme } = make();
    points.set(DATASETS.xor);
    expect(points.mesh.instanceColor?.version).toBeGreaterThan(0);
    const colour = new Color();
    DATASETS.xor.points.forEach((point, i) => {
      points.mesh.getColorAt(i, colour);
      expectColour(colour, point.y === 1 ? theme.ink : theme.accent);
    });
    points.dispose();
  });

  it("re-uses the one instanced mesh across datasets", () => {
    const { points } = make();
    points.set(DATASETS.xor);
    const mesh = points.mesh;
    points.set(DATASETS.moons);
    expect(points.mesh).toBe(mesh);
    expect(points.mesh.count).toBe(60);
    points.dispose();
  });

  it("setShow toggles the group", () => {
    const { points } = make();
    points.set(DATASETS.xor);
    points.setShow(false);
    expect(points.group.visible).toBe(false);
    points.setShow(true);
    expect(points.group.visible).toBe(true);
    points.dispose();
  });

  it("re-colours the kept dataset when the theme changes", () => {
    const { points, theme } = make();
    points.set(DATASETS.xor);
    theme.ink.setHex(0x123456);
    theme.accent.setHex(0x654321);
    theme.dispatchEvent(new Event("change"));
    const colour = new Color();
    DATASETS.xor.points.forEach((point, i) => {
      points.mesh.getColorAt(i, colour);
      expectColour(colour, point.y === 1 ? theme.ink : theme.accent);
    });
    points.dispose();
  });

  it("dispose releases the geometry, the material and the theme listener", () => {
    const { points, theme } = make();
    const remove = vi.spyOn(theme, "removeEventListener");
    const spies = [
      vi.spyOn(points.mesh.geometry, "dispose"),
      vi.spyOn(points.mesh.material as MeshStandardMaterial, "dispose"),
    ];
    points.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
