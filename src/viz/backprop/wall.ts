import { DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import type { ThemeColors } from "../types";
import { disposeLayers, type Layer, lineLayer, type Segment, type Vec3 } from "../shared/layer";
import { writeWorldSegments } from "../shared/layer-write";
import { segment } from "../shared/lift";
import { LIFT_WALL, WALL_H, WALL_W } from "./layout";

export interface Wall {
  readonly group: Group;
  /** The translucent plane y = 0 the graph is drawn on. */
  readonly mesh: Mesh;
  /** The outline of the wall's four edges; read by tests. */
  readonly outline: Layer;
  dispose(): void;
}

/** Translucent enough that edges and bars behind the wall stay readable. */
const OPACITY = 0.18;

/** The wall's four edges in world space, lifted toward the camera like the graph's edges. */
function outlineSegments(): readonly Segment[] {
  const hw = WALL_W / 2;
  const corners: readonly Vec3[] = [
    [-hw, 0, 0],
    [hw, 0, 0],
    [hw, 0, WALL_H],
    [-hw, 0, WALL_H],
  ];
  return corners.map((a, i) => segment(a, corners[(i + 1) % corners.length]!, LIFT_WALL));
}

/**
 * The single translucent wall (y = 0) the backprop graph is drawn on, with the
 * outline of its four edges. The wall does not write depth, so the lines on it
 * stay visible through it from either side.
 */
export function createWall(theme: ThemeColors): Wall {
  const geometry = new PlaneGeometry(WALL_W, WALL_H);
  const material = new MeshBasicMaterial({
    transparent: true,
    opacity: OPACITY,
    side: DoubleSide,
    depthWrite: false,
  });
  // PlaneGeometry lies in the XY plane with normal +z; rotate so the normal
  // points -y (the plane y = 0), then centre it on the wall.
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(0, 0, WALL_H / 2);
  // Three's default renderOrder 0, matching the outline; the edge layers sit above at 2 and 3.

  const outlineSegs = outlineSegments();
  const outline = lineLayer(outlineSegs.length * 2, 0, { depth: true });
  writeWorldSegments(outline, outlineSegs);

  const group = new Group();
  group.add(mesh, outline.object);

  function applyTheme(): void {
    material.color.copy(theme.faint);
    outline.material.color.copy(theme.line);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  return {
    group,
    mesh,
    outline,

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      geometry.dispose();
      material.dispose();
      disposeLayers([outline]);
    },
  };
}
