import { Box3, type Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import { describe, expect, it, vi } from "vitest";
import { createThemeColors } from "../../../src/core/theme";
import { createWall, type WallOptions } from "../../../src/viz/shared/wall";

const BACKPROP: WallOptions = { width: 10, height: 6, opacity: 0.18 };

function make(opts: WallOptions = BACKPROP) {
  const theme = createThemeColors(() => "#1f4ed8");
  return { wall: createWall(theme, opts), theme };
}

/** The world-space bounding box of the wall's plane, with its transform applied. */
function worldBox(mesh: Mesh): Box3 {
  mesh.updateMatrixWorld(true);
  const world = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  const box = new Box3().setFromBufferAttribute(world.getAttribute("position") as never);
  world.dispose();
  return box;
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
    const box = worldBox(wall.mesh);
    expect(box.min.x).toBeCloseTo(-5, 6);
    expect(box.max.x).toBeCloseTo(5, 6);
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(box.max.y).toBeCloseTo(0, 6);
    expect(box.min.z).toBeCloseTo(0, 6);
    expect(box.max.z).toBeCloseTo(6, 6);
    wall.dispose();
  });

  it("takes its size and opacity from the options", () => {
    const { wall } = make({ width: 8, height: 4, opacity: 0.3 });
    const box = worldBox(wall.mesh);
    expect(box.min.x).toBeCloseTo(-4, 6);
    expect(box.max.x).toBeCloseTo(4, 6);
    expect(box.min.z).toBeCloseTo(0, 6);
    expect(box.max.z).toBeCloseTo(4, 6);
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(box.max.y).toBeCloseTo(0, 6);
    expect((wall.mesh.material as MeshBasicMaterial).opacity).toBe(0.3);
    wall.dispose();
  });

  it("outlines the four wall edges, lifted off the wall toward the camera", () => {
    const { wall } = make();
    expect(wall.outline.geometry.drawRange.count).toBe(8);
    for (let n = 0; n < 8; n++) expect(wall.outline.positions[n * 3 + 1]).toBeCloseTo(-0.01, 6);
    wall.dispose();
  });

  it("recolours the mesh and the outline when the theme changes", () => {
    const { wall, theme } = make();
    theme.faint.setHex(0x123456);
    theme.line.setHex(0x654321);
    theme.dispatchEvent(new Event("change"));
    expect((wall.mesh.material as MeshBasicMaterial).color.equals(theme.faint)).toBe(true);
    expect(wall.outline.material.color.equals(theme.line)).toBe(true);
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
