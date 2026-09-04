import { Box3, MeshBasicMaterial, PlaneGeometry } from "three";
import { describe, expect, it, vi } from "vitest";
import { createThemeColors } from "../../../src/core/theme";
import { createWall } from "../../../src/viz/backprop/wall";

function make() {
  const theme = createThemeColors(() => "#1f4ed8");
  return { wall: createWall(theme), theme };
}

describe("createWall", () => {
  it("is a translucent 10x6 plane at y = 0 centred (0, 0, 3)", () => {
    const { wall, theme } = make();
    expect(wall.mesh.position.toArray()).toEqual([0, 0, 3]);
    expect(wall.mesh.rotation.x).toBeCloseTo(Math.PI / 2, 9);
    const geometry = wall.mesh.geometry as PlaneGeometry;
    expect([geometry.parameters.width, geometry.parameters.height]).toEqual([10, 6]);
    const m = wall.mesh.material as MeshBasicMaterial;
    expect(m.transparent).toBe(true);
    expect(m.opacity).toBe(0.18);
    expect(m.depthWrite).toBe(false);
    expect(m.color.equals(theme.faint)).toBe(true);
    expect(wall.mesh.renderOrder).toBe(0);
    wall.dispose();
  });

  it("covers x in [-5, 5], y = 0, z in [0, 6] once the mesh transform is applied", () => {
    const { wall } = make();
    wall.mesh.updateMatrixWorld(true);
    const world = wall.mesh.geometry.clone().applyMatrix4(wall.mesh.matrixWorld);
    const box = new Box3().setFromBufferAttribute(world.getAttribute("position") as never);
    expect(box.min.x).toBeCloseTo(-5, 6);
    expect(box.max.x).toBeCloseTo(5, 6);
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(box.max.y).toBeCloseTo(0, 6);
    expect(box.min.z).toBeCloseTo(0, 6);
    expect(box.max.z).toBeCloseTo(6, 6);
    world.dispose();
    wall.dispose();
  });

  it("outlines the four wall edges", () => {
    const { wall } = make();
    expect(wall.outline.geometry.drawRange.count).toBe(8);
    wall.dispose();
  });

  it("dispose releases geometry, material, the outline and the theme listener", () => {
    const { wall, theme } = make();
    const remove = vi.spyOn(theme, "removeEventListener");
    const spies = [
      vi.spyOn(wall.mesh.geometry, "dispose"),
      vi.spyOn(wall.mesh.material as MeshBasicMaterial, "dispose"),
      vi.spyOn(wall.outline.geometry, "dispose"),
      vi.spyOn(wall.outline.material, "dispose"),
    ];
    wall.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
