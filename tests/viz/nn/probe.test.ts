import type { MeshBasicMaterial, MeshStandardMaterial, SphereGeometry } from "three";
import { describe, expect, it, vi } from "vitest";
import { createThemeColors } from "../../../src/core/theme";
import { floorPoint } from "../../../src/viz/nn/layout";
import { createProbe } from "../../../src/viz/nn/probe";

function make() {
  const theme = createThemeColors(() => "#1f4ed8");
  const probe = createProbe(theme);
  return { probe, theme };
}

const RADIUS = 0.12;

describe("createProbe", () => {
  it("stands the sphere and its hit volume on the floor at the probe position", () => {
    const { probe } = make();
    probe.set([1, -2]);
    const [x, y, z] = floorPoint([1, -2]);
    expect(probe.mesh.position.toArray()).toEqual([x, y, z + RADIUS]);
    expect(probe.hitTarget.position.toArray()).toEqual([x, y, z + RADIUS]);
    probe.dispose();
  });

  it("moves both spheres on every set", () => {
    const { probe } = make();
    probe.set([1, -2]);
    probe.set([-3, 0.5]);
    const [x, y, z] = floorPoint([-3, 0.5]);
    expect(probe.mesh.position.toArray()).toEqual([x, y, z + RADIUS]);
    expect(probe.hitTarget.position.toArray()).toEqual([x, y, z + RADIUS]);
    probe.dispose();
  });

  it("draws a soft sphere of radius 0.12 above the flat layers", () => {
    const { probe, theme } = make();
    expect((probe.mesh.geometry as SphereGeometry).parameters.radius).toBe(RADIUS);
    const material = probe.mesh.material as MeshStandardMaterial;
    expect(material.roughness).toBe(0.5);
    expect(material.color.equals(theme.soft)).toBe(true);
    expect(probe.mesh.renderOrder).toBe(10);
    expect(probe.group.children).toContain(probe.mesh);
    probe.dispose();
  });

  it("gives the hit volume radius 0.25 and an invisible material, not an invisible mesh", () => {
    const { probe } = make();
    expect((probe.hitTarget.geometry as SphereGeometry).parameters.radius).toBe(0.25);
    const material = probe.hitTarget.material as MeshBasicMaterial;
    expect(material.visible).toBe(false);
    // Three's Raycaster tests layers and materials, not `object.visible`.
    expect(probe.hitTarget.visible).toBe(true);
    expect(probe.group.children).toContain(probe.hitTarget);
    probe.dispose();
  });

  it("recolours the sphere when the theme changes", () => {
    const { probe, theme } = make();
    theme.soft.setHex(0x123456);
    theme.dispatchEvent(new Event("change"));
    expect((probe.mesh.material as MeshStandardMaterial).color.equals(theme.soft)).toBe(true);
    probe.dispose();
  });

  it("dispose releases both geometries, both materials and the theme listener", () => {
    const { probe, theme } = make();
    const remove = vi.spyOn(theme, "removeEventListener");
    const spies = [
      vi.spyOn(probe.mesh.geometry, "dispose"),
      vi.spyOn(probe.hitTarget.geometry, "dispose"),
      vi.spyOn(probe.mesh.material as MeshStandardMaterial, "dispose"),
      vi.spyOn(probe.hitTarget.material as MeshBasicMaterial, "dispose"),
    ];
    probe.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
