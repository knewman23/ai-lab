import { DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import type { ThemeColors } from "../types";
import { disposeLayers, type Layer, lineLayer, type Segment, type Vec3 } from "./layer";
import { writeWorldSegments } from "./layer-write";
import { segment } from "./lift";

export interface Wall {
  readonly group: Group;
  /** The translucent plane y = 0 the scene is drawn on. */
  readonly mesh: Mesh;
  /** The outline of the wall's four edges; read by tests. */
  readonly outline: Layer;
  dispose(): void;
}

/** The wall's size (X and Z extent) and how translucent it is. */
export interface WallOptions {
  readonly width: number;
  readonly height: number;
  /** Translucent enough that what is drawn behind the wall stays readable. */
  readonly opacity: number;
}

/**
 * Lift off the wall toward −y, the camera side, so the outline is not z-fought
 * by the wall. Owned here rather than taken from `lift.ts`, whose front-face
 * lift points the other way, and duplicated per scene layout by design: this
 * module depends on no scene.
 */
const LIFT_WALL: Vec3 = [0, -0.01, 0];

/** The wall's four edges in world space, lifted toward the camera. */
function outlineSegments(width: number, height: number): readonly Segment[] {
  const hw = width / 2;
  const corners: readonly Vec3[] = [
    [-hw, 0, 0],
    [hw, 0, 0],
    [hw, 0, height],
    [-hw, 0, height],
  ];
  return corners.map((a, i) => segment(a, corners[(i + 1) % corners.length]!, LIFT_WALL));
}

/**
 * A single translucent wall (y = 0), spanning x ∈ [−width/2, width/2] and
 * z ∈ [0, height], with the outline of its four edges. The wall does not write
 * depth, so the lines on it stay visible through it from either side.
 */
export function createWall(theme: ThemeColors, opts: WallOptions): Wall {
  const { width, height, opacity } = opts;
  const geometry = new PlaneGeometry(width, height);
  const material = new MeshBasicMaterial({
    transparent: true,
    opacity,
    side: DoubleSide,
    depthWrite: false,
  });
  // PlaneGeometry lies in the XY plane with normal +z; rotate so the normal
  // points -y (the plane y = 0), then centre it on the wall.
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(0, 0, height / 2);
  // Three's default renderOrder 0, matching the outline; scene layers sit above it.

  const outlineSegs = outlineSegments(width, height);
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
