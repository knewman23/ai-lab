import { DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import type { ThemeColors } from "../types";
import { disposeLayers, lineLayer } from "../shared/layer";
import { writeWorldSegments } from "../shared/layer-write";
import { axisSegments, outlineSegments } from "./faces-geometry";

export interface Faces {
  readonly group: Group;
  /**
   * The front wall (y = 0): the surface a click lands on to place x. It shares
   * its geometry and material with the other two faces; split them before
   * styling one face on its own.
   */
  readonly front: Mesh;
  dispose(): void;
}

/** Edge of each square face. */
const SIZE = 6;
/** Half-edge: the distance from a face's centre to its edges. */
const HALF = SIZE / 2;
/** Translucent enough that lines and curves behind a face stay readable. */
const OPACITY = 0.35;

/**
 * The three translucent faces of the scene's corner, the outline of their nine
 * edges, and the axes and ticks drawn on them. The faces do not write depth,
 * so the lines on a wall stay visible through it from either side.
 */
export function createFaces(theme: ThemeColors): Faces {
  const geometry = new PlaneGeometry(SIZE, SIZE);
  const material = new MeshBasicMaterial({
    transparent: true,
    opacity: OPACITY,
    side: DoubleSide,
    depthWrite: false,
  });

  // PlaneGeometry lies in the XY plane with normal +z; each wall is rotated so
  // its normal points along the axis it holds fixed, then moved to the face centre.
  const front = new Mesh(geometry, material);
  front.rotation.x = Math.PI / 2; // normal +z -> -y: the plane y = 0
  front.position.set(0, 0, HALF);
  const side = new Mesh(geometry, material);
  side.rotation.y = Math.PI / 2; // normal +z -> +x: the plane x = -3
  side.position.set(-HALF, HALF, HALF);
  const floor = new Mesh(geometry, material); // already the plane z = 0
  floor.position.set(0, HALF, 0);
  // The faces keep Three's default renderOrder of 0, matching the outline layer; the axes layer sits above at 1.

  const outline = outlineSegments();
  const outlineLayer = lineLayer(outline.length * 2, 0, { depth: true });
  writeWorldSegments(outlineLayer, outline);

  const axes = axisSegments();
  const axesLayer = lineLayer(axes.length * 2, 1, { depth: true });
  writeWorldSegments(axesLayer, axes);

  const layers = [outlineLayer, axesLayer];
  const group = new Group();
  group.add(front, side, floor, outlineLayer.object, axesLayer.object);

  function applyTheme(): void {
    material.color.copy(theme.faint);
    outlineLayer.material.color.copy(theme.line);
    axesLayer.material.color.copy(theme.line);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  return {
    group,
    front,

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      geometry.dispose();
      material.dispose();
      disposeLayers(layers);
    },
  };
}
