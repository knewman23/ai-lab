import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from "three";
import { contourLevels, marchingSquares } from "../../core/math/contours";
import type { Surface } from "../../core/math/surfaces";
import type { ThemeColors } from "../types";
import type { SurfaceGrid } from "./surface-mesh";

export interface ContourLines {
  readonly object: LineSegments;
  setSurface(surface: Surface, grid: SurfaceGrid): void;
  setVisible(on: boolean): void;
  dispose(): void;
}

/** Vertices in the preallocated position buffer. */
const VERTEX_CAPACITY = 66_666;
/**
 * Floats in that buffer. It must stay a whole number of vertices: a
 * BufferAttribute's `count` is `array.length / itemSize` unrounded, so a
 * length that is not a multiple of 3 makes three read one float past the end
 * (undefined, hence NaN) in computeBoundingSphere.
 */
const CAPACITY = VERTEX_CAPACITY * 3;
const LEVEL_COUNT = 12;
/** How far below the lowest point of the surface the contours are drawn. */
const DEPTH_BELOW = 0.35;

/**
 * The contour plot projected onto a flat plane below the surface: twelve
 * levels through the displayed height range, extracted with marching squares
 * and written into one preallocated line buffer.
 */
export function createContourLines(theme: ThemeColors): ContourLines {
  const positions = new Float32Array(CAPACITY);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);

  const material = new LineBasicMaterial({ transparent: true, opacity: 0.6 });
  material.color.copy(theme.soft);

  const object = new LineSegments(geometry, material);

  function onThemeChange(): void {
    material.color.copy(theme.soft);
  }
  theme.addEventListener("change", onThemeChange);

  let warnedTruncated = false;

  return {
    object,

    setSurface(surface: Surface, grid: SurfaceGrid): void {
      const [x0, x1] = surface.domain.x;
      const [y0, y1] = surface.domain.y;
      const { nx, ny, heights, heightRange } = grid;
      const [min, max] = heightRange;
      const dx = (x1 - x0) / (nx - 1);
      const dy = (y1 - y0) / (ny - 1);
      const z = min - DEPTH_BELOW;

      let n = 0;
      let truncated = false;

      for (const level of contourLevels(min, max, LEVEL_COUNT)) {
        const segments = marchingSquares(heights, nx, ny, level);
        // Four numbers per segment, six floats out: never split a pair.
        for (let s = 0; s < segments.length; s += 4) {
          if (n + 6 > CAPACITY) {
            truncated = true;
            break;
          }
          for (let e = 0; e < 2; e++) {
            positions[n] = x0 + segments[s + e * 2]! * dx;
            positions[n + 1] = y0 + segments[s + e * 2 + 1]! * dy;
            positions[n + 2] = z;
            n += 3;
          }
        }
        if (truncated) break;
      }

      if (truncated && !warnedTruncated) {
        warnedTruncated = true;
        if (import.meta.env.DEV) console.warn("contour buffer full; lines truncated");
      }

      geometry.getAttribute("position").needsUpdate = true;
      geometry.setDrawRange(0, n / 3);
      geometry.computeBoundingSphere();
    },

    setVisible(on: boolean): void {
      object.visible = on;
    },

    dispose(): void {
      theme.removeEventListener("change", onThemeChange);
      // Detach first: the assembler disposes the scene afterwards, and a
      // still-attached object would have its geometry and material disposed a
      // second time by that traversal.
      object.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
