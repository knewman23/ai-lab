import {
  type Color,
  type Material,
  type Mesh,
  MeshStandardMaterial,
  type SphereGeometry,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { COMPOSITIONS } from "../../../src/core/math/compositions";
import { createThemeColors } from "../../../src/core/theme";
import { facePoints } from "../../../src/viz/chain-rule/links-geometry";
import { createPoints } from "../../../src/viz/chain-rule/points";
import { derived, initialState, setX } from "../../../src/viz/chain-rule/state";

function make() {
  const theme = createThemeColors(() => "#1f4ed8");
  const s = setX(initialState(), 0.4);
  const points = facePoints(COMPOSITIONS.sin3x, s.x, derived(s));
  return { pts: createPoints(theme), theme, points };
}

function meshes(pts: ReturnType<typeof createPoints>): Mesh[] {
  return pts.group.children.filter((c): c is Mesh => (c as Mesh).isMesh);
}

function byRadius(pts: ReturnType<typeof createPoints>, r: number): Mesh[] {
  return meshes(pts).filter(
    (m) => Math.abs((m.geometry as SphereGeometry).parameters.radius - r) < 1e-9,
  );
}

function at(m: Mesh, v: readonly [number, number, number]): boolean {
  return m.position.distanceTo(new Vector3(...v)) < 1e-9;
}

describe("createPoints", () => {
  it("places P, Q, R and the hit spheres at the marked points", () => {
    const { pts, points } = make();
    pts.set(points, true);
    const main = byRadius(pts, 0.08);
    expect(main.some((m) => at(m, points.p))).toBe(true);
    expect(main.some((m) => at(m, points.r))).toBe(true);
    expect(byRadius(pts, 0.07).some((m) => at(m, points.q))).toBe(true);
    expect(at(pts.hitP, points.p)).toBe(true);
    expect(at(pts.hitR, points.r)).toBe(true);
    pts.dispose();
  });

  it("shows the primed spheres at P′, Q′, R′ when primed, hides them otherwise", () => {
    const { pts, points } = make();
    const primed = points.primed;
    expect(primed).not.toBeNull();
    if (primed === null) return;
    pts.set(points, true);
    const small = byRadius(pts, 0.05);
    expect(small).toHaveLength(3);
    for (const m of small) expect(m.visible).toBe(true);
    expect(small.some((m) => at(m, primed.p))).toBe(true);
    expect(small.some((m) => at(m, primed.q))).toBe(true);
    expect(small.some((m) => at(m, primed.r))).toBe(true);
    pts.set(points, false);
    for (const m of small) expect(m.visible).toBe(false);
    pts.dispose();
  });

  it("hides the primed spheres when the state has no Δx step", () => {
    const { pts } = make();
    const s = setX(initialState(), 3);
    pts.set(facePoints(COMPOSITIONS.sin3x, s.x, derived(s)), true);
    for (const m of byRadius(pts, 0.05)) expect(m.visible).toBe(false);
    pts.dispose();
  });

  it("keeps the hit spheres raycastable but undrawn", () => {
    const { pts } = make();
    for (const hit of [pts.hitP, pts.hitR]) {
      expect(hit.visible).toBe(true);
      expect((hit.material as Material).visible).toBe(false);
      expect((hit.geometry as SphereGeometry).parameters.radius).toBe(0.2);
    }
    pts.dispose();
  });

  it("uses the listed radii, theme colours and render order", () => {
    const { pts, theme } = make();
    expect(byRadius(pts, 0.08)).toHaveLength(2);
    expect(byRadius(pts, 0.07)).toHaveLength(1);
    expect(byRadius(pts, 0.05)).toHaveLength(3);
    expect(byRadius(pts, 0.2)).toHaveLength(2);
    const colour = (m: Mesh) => (m.material as Material & { color: Color }).color;
    for (const m of byRadius(pts, 0.08)) expect(colour(m).equals(theme.ink)).toBe(true);
    for (const m of byRadius(pts, 0.07)) expect(colour(m).equals(theme.soft)).toBe(true);
    for (const m of byRadius(pts, 0.05)) expect(colour(m).equals(theme.soft)).toBe(true);
    for (const m of [...byRadius(pts, 0.08), ...byRadius(pts, 0.07), ...byRadius(pts, 0.05)]) {
      expect(m.renderOrder).toBe(10);
      expect(m.material).toBeInstanceOf(MeshStandardMaterial);
      expect((m.material as Material).transparent).toBe(true);
      expect((m.material as Material).depthTest).toBe(true);
    }
    pts.dispose();
  });

  it("dispose releases each geometry and material once and drops the theme listener", () => {
    const { pts, theme } = make();
    const remove = vi.spyOn(theme, "removeEventListener");
    const geometries = new Set(meshes(pts).map((m) => m.geometry));
    const materials = new Set(meshes(pts).map((m) => m.material as Material));
    const spies = [
      ...[...geometries].map((g) => vi.spyOn(g, "dispose")),
      ...[...materials].map((m) => vi.spyOn(m, "dispose")),
    ];
    pts.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
