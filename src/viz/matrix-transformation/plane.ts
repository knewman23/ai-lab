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
import { clipSegment } from "../../core/math/matrix2";
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
/** Fill alpha for a determinant that keeps orientation. */
const FILL_OPACITY = 0.35;
/**
 * Fill alpha for the warn case. The light palette's `--warn` is a dark gold,
 * which at 0.35 over the near-white page washes out to a neutral beige; the
 * extra alpha is what keeps "orientation reversed" readable in both themes.
 */
const WARN_FILL_OPACITY = 0.45;
/** Clipped grid segments shorter than this have collapsed to a point. */
const SEGMENT_EPS = 1e-9;

/**
 * Writes M * v into `out` and returns it. `apply` would do the same, but it
 * allocates, and this runs 30 times per frame.
 */
function mapInto(m: Mat2, v: Vec2, out: [number, number]): Vec2 {
  out[0] = m[0] * v[0] + m[1] * v[1];
  out[1] = m[2] * v[0] + m[3] * v[1];
  return out;
}

const UNIT_X: Vec2 = [1, 0];
const UNIT_Y: Vec2 = [0, 1];

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
    opacity: FILL_OPACITY,
  });
  const fill = new Mesh(fillGeometry, fillMaterial);
  fill.renderOrder = 5;

  const layers = [reference, grid, ghost];
  group.add(reference.object, grid.object, ghost.object, fill);

  let lastDet = 1;
  // Scratch endpoints, so setMatrix allocates nothing of its own.
  const from: [number, number] = [0, 0];
  const to: [number, number] = [0, 0];
  const col1: [number, number] = [0, 0];
  const col2: [number, number] = [0, 0];

  /** Paints the fill for a determinant: accent when orientation holds, warn otherwise. */
  function paintFill(detMt: number): void {
    const warn = detMt <= DET_EPS;
    fillMaterial.color.copy(warn ? theme.warn : theme.accent);
    fillMaterial.opacity = warn ? WARN_FILL_OPACITY : FILL_OPACITY;
  }

  function applyTheme(): void {
    reference.material.color.copy(theme.line);
    grid.material.color.copy(theme.soft);
    ghost.material.color.copy(theme.faint);
    paintFill(lastDet);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  function setCorner(slot: number, x: number, y: number): void {
    fillPositions[slot * 3] = x;
    fillPositions[slot * 3 + 1] = y;
  }

  /** Writes the collapsed stand-in rectangle; returns false if it is a point. */
  function setCollapsed(c1: Vec2, c2: Vec2): boolean {
    // The corners are collinear here, so the longer column gives the axis; if
    // it is degenerate so is their sum, and the whole square is one point.
    const dir = Math.hypot(c1[0], c1[1]) >= Math.hypot(c2[0], c2[1]) ? c1 : c2;
    const len = Math.hypot(dir[0], dir[1]);
    if (len <= DET_EPS) return false;

    const ux = dir[0] / len;
    const uy = dir[1] / len;
    // The four corners 0, c1, c2, c1 + c2 projected onto the collapsed axis.
    const t1 = c1[0] * ux + c1[1] * uy;
    const t2 = c2[0] * ux + c2[1] * uy;
    const min = Math.min(0, t1, t2, t1 + t2);
    const max = Math.max(0, t1, t2, t1 + t2);
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
        const p = mapInto(mt, lines[i]!, from);
        const q = mapInto(mt, lines[i + 1]!, to);
        const clipped = clipSegment(p, q, bound);
        if (clipped === null) continue;
        const [a, b] = clipped;
        // A line the matrix has squashed to a point draws nothing.
        if (Math.abs(b[0] - a[0]) < SEGMENT_EPS && Math.abs(b[1] - a[1]) < SEGMENT_EPS) continue;
        for (const point of clipped) {
          gridPositions[n] = point[0];
          gridPositions[n + 1] = point[1];
          gridPositions[n + 2] = 0;
          n += 3;
        }
      }
      grid.geometry.getAttribute("position").needsUpdate = true;
      grid.geometry.setDrawRange(0, n / 3);
      grid.geometry.computeBoundingSphere();

      const c1 = mapInto(mt, UNIT_X, col1);
      const c2 = mapInto(mt, UNIT_Y, col2);
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
      paintFill(detMt);
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
