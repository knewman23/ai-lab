import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from "three";
import { apply, clipSegment } from "../../core/math/matrix2";
import type { Mat2 } from "../../core/math/matrix2";
import type { Vec2 } from "../../core/math/numeric";
import type { ThemeColors } from "../types";

export interface Plane {
  readonly group: Group;
  setMatrix(mt: Mat2, detMt: number): void;
  setShow(show: { grid: boolean; ghost: boolean }): void;
  dispose(): void;
}

/** Half-width of the drawn grid: lines at every integer in [-EXTENT, EXTENT]. */
const EXTENT = 3;
/** 7 vertical + 7 horizontal lines, two endpoints each, three floats each. */
const GRID_FLOATS = 14 * 2 * 3;
/** Below this the determinant counts as zero and the square has collapsed. */
const DET_EPS = 1e-6;
/** Half-width of the rectangle that stands in for a collapsed square. */
const COLLAPSED_HALF_WIDTH = 0.02;

/** The 14 reference lines as endpoint pairs, in grid space. */
function gridLines(): Vec2[] {
  const lines: Vec2[] = [];
  for (let i = -EXTENT; i <= EXTENT; i++) {
    lines.push([i, -EXTENT], [i, EXTENT], [-EXTENT, i], [EXTENT, i]);
  }
  return lines;
}

interface LineLayer {
  readonly object: LineSegments;
  readonly geometry: BufferGeometry;
  readonly material: LineBasicMaterial;
}

/** One coplanar line layer over a preallocated position buffer. */
function lineLayer(positions: Float32Array, renderOrder: number): LineLayer {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  const material = new LineBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const object = new LineSegments(geometry, material);
  object.renderOrder = renderOrder;
  return { object, geometry, material };
}

/**
 * The four coplanar layers at z = 0: the untransformed reference grid, the
 * same grid under M(t) clipped to the display bound, the ghost outline of the
 * unit square and the mapped unit square's fill.
 */
export function createPlane(theme: ThemeColors, bound = 5): Plane {
  const group = new Group();
  const lines = gridLines();

  // 1. Reference grid: static, never transformed.
  const refPositions = new Float32Array(GRID_FLOATS);
  for (let i = 0; i < lines.length; i++) {
    refPositions[i * 3] = lines[i]![0];
    refPositions[i * 3 + 1] = lines[i]![1];
  }
  const reference = lineLayer(refPositions, 1);

  // 2. Transformed grid: rewritten by setMatrix, survivors compacted forward.
  const gridPositions = new Float32Array(GRID_FLOATS);
  const grid = lineLayer(gridPositions, 2);
  grid.geometry.setDrawRange(0, 0);

  // 3. Ghost square: the untransformed unit square, static.
  // prettier-ignore
  const ghost = lineLayer(
    new Float32Array([
      0, 0, 0, 1, 0, 0,
      1, 0, 0, 1, 1, 0,
      1, 1, 0, 0, 1, 0,
      0, 1, 0, 0, 0, 0,
    ]),
    4,
  );

  // 4. Unit square fill: two triangles over the four mapped corners.
  const fillPositions = new Float32Array(12);
  const fillGeometry = new BufferGeometry();
  fillGeometry.setAttribute("position", new BufferAttribute(fillPositions, 3));
  fillGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  const fillMaterial = new MeshBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    opacity: 0.35,
  });
  const fill = new Mesh(fillGeometry, fillMaterial);
  fill.renderOrder = 5;

  const layers = [reference, grid, ghost];
  group.add(reference.object, grid.object, ghost.object, fill);

  let lastDet = 1;

  function applyTheme(): void {
    reference.material.color.copy(theme.line);
    grid.material.color.copy(theme.soft);
    ghost.material.color.copy(theme.faint);
    fillMaterial.color.copy(lastDet > DET_EPS ? theme.accent : theme.warn);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  function setCorner(slot: number, x: number, y: number): void {
    fillPositions[slot * 3] = x;
    fillPositions[slot * 3 + 1] = y;
  }

  /** Writes the collapsed stand-in rectangle; returns false if it is a point. */
  function setCollapsed(c1: Vec2, c2: Vec2): boolean {
    const sum: Vec2 = [c1[0] + c2[0], c1[1] + c2[1]];
    const pick = Math.hypot(...c1) >= Math.hypot(...c2) ? c1 : c2;
    const dir = Math.hypot(...pick) > DET_EPS ? pick : sum;
    const len = Math.hypot(...dir);
    if (len <= DET_EPS) return false;

    const ux = dir[0] / len;
    const uy = dir[1] / len;
    let min = 0;
    let max = 0;
    for (const c of [c1, c2, sum]) {
      const t = c[0] * ux + c[1] * uy;
      min = Math.min(min, t);
      max = Math.max(max, t);
    }
    const nx = -uy * COLLAPSED_HALF_WIDTH;
    const ny = ux * COLLAPSED_HALF_WIDTH;
    setCorner(0, min * ux - nx, min * uy - ny);
    setCorner(1, max * ux - nx, max * uy - ny);
    setCorner(2, max * ux + nx, max * uy + ny);
    setCorner(3, min * ux + nx, min * uy + ny);
    return true;
  }

  return {
    group,

    setMatrix(mt: Mat2, detMt: number): void {
      let n = 0;
      for (let i = 0; i < lines.length; i += 2) {
        const clipped = clipSegment(apply(mt, lines[i]!), apply(mt, lines[i + 1]!), bound);
        if (clipped === null) continue;
        for (const point of clipped) {
          gridPositions[n] = point[0];
          gridPositions[n + 1] = point[1];
          gridPositions[n + 2] = 0;
          n += 3;
        }
      }
      gridPositions.fill(0, n);
      grid.geometry.getAttribute("position").needsUpdate = true;
      grid.geometry.setDrawRange(0, n / 3);
      grid.geometry.computeBoundingSphere();

      const c1 = apply(mt, [1, 0]);
      const c2 = apply(mt, [0, 1]);
      if (Math.abs(detMt) > DET_EPS) {
        setCorner(0, 0, 0);
        setCorner(1, c1[0], c1[1]);
        setCorner(2, c1[0] + c2[0], c1[1] + c2[1]);
        setCorner(3, c2[0], c2[1]);
        fillGeometry.setDrawRange(0, 6);
      } else {
        fillGeometry.setDrawRange(0, setCollapsed(c1, c2) ? 6 : 0);
      }
      fillGeometry.getAttribute("position").needsUpdate = true;
      fillGeometry.computeBoundingSphere();

      lastDet = detMt;
      fillMaterial.color.copy(detMt > DET_EPS ? theme.accent : theme.warn);
    },

    setShow(show: { grid: boolean; ghost: boolean }): void {
      grid.object.visible = show.grid;
      ghost.object.visible = show.ghost;
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      for (const layer of layers) {
        layer.geometry.dispose();
        layer.material.dispose();
      }
      fillGeometry.dispose();
      fillMaterial.dispose();
    },
  };
}
