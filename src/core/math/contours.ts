/**
 * Marching squares contour extraction and contour level generation.
 *
 * Grid convention: `grid[j * nx + i]` is the sample value at column `i`,
 * row `j` (0-based, `i` in `[0, nx)`, `j` in `[0, ny)`). Returned segment
 * coordinates are in grid index space (fractional `i`, `j`); callers map
 * that space onto world coordinates.
 */

type Point = readonly [number, number];

/** Linear interpolation of the crossing point between two grid samples. */
function interp(level: number, vA: number, vB: number, pA: Point, pB: Point): Point {
  const t = (level - vA) / (vB - vA);
  return [pA[0] + t * (pB[0] - pA[0]), pA[1] + t * (pB[1] - pA[1])];
}

/**
 * Extracts contour line segments at `level` from a height grid using the
 * standard 16-case marching squares algorithm with linear edge
 * interpolation. Cases 5 and 10 (diagonal/ambiguous "saddle" cells) are
 * resolved by comparing the cell-centre average against `level`.
 *
 * Returns a flat array of segment endpoints `[x0, y0, x1, y1, ...]` in
 * grid index space.
 */
export function marchingSquares(
  grid: Float32Array,
  nx: number,
  ny: number,
  level: number,
): Float32Array {
  const out: number[] = [];

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = grid[j * nx + i]!; // bottom-left  (i,   j)
      const b = grid[j * nx + i + 1]!; // bottom-right (i+1, j)
      const c = grid[(j + 1) * nx + i + 1]!; // top-right    (i+1, j+1)
      const d = grid[(j + 1) * nx + i]!; // top-left     (i,   j+1)

      const caseIndex =
        (a > level ? 1 : 0) | (b > level ? 2 : 0) | (c > level ? 4 : 0) | (d > level ? 8 : 0);

      if (caseIndex === 0 || caseIndex === 15) continue;

      const pA: Point = [i, j];
      const pB: Point = [i + 1, j];
      const pC: Point = [i + 1, j + 1];
      const pD: Point = [i, j + 1];

      // Edge crossing points, computed lazily and shared across cases.
      const left = (): Point => interp(level, a, d, pA, pD);
      const bottom = (): Point => interp(level, a, b, pA, pB);
      const right = (): Point => interp(level, b, c, pB, pC);
      const top = (): Point => interp(level, d, c, pD, pC);

      const emit = (p0: Point, p1: Point): void => {
        out.push(p0[0], p0[1], p1[0], p1[1]);
      };

      switch (caseIndex) {
        case 1:
        case 14:
          emit(left(), bottom());
          break;
        case 2:
        case 13:
          emit(bottom(), right());
          break;
        case 3:
        case 12:
          emit(left(), right());
          break;
        case 4:
        case 11:
          emit(right(), top());
          break;
        case 6:
        case 9:
          emit(bottom(), top());
          break;
        case 7:
        case 8:
          emit(left(), top());
          break;
        case 5: {
          const center = (a + b + c + d) / 4;
          if (center > level) {
            emit(left(), top());
            emit(bottom(), right());
          } else {
            emit(left(), bottom());
            emit(top(), right());
          }
          break;
        }
        case 10: {
          const center = (a + b + c + d) / 4;
          if (center > level) {
            emit(left(), bottom());
            emit(top(), right());
          } else {
            emit(left(), top());
            emit(bottom(), right());
          }
          break;
        }
        default:
          break;
      }
    }
  }

  return new Float32Array(out);
}

/**
 * Returns `count` levels evenly spaced strictly inside `(min, max)`:
 * `min + (k + 1) * (max - min) / (count + 1)` for `k` in `[0, count)`.
 */
export function contourLevels(min: number, max: number, count = 12): number[] {
  const levels: number[] = [];
  const span = max - min;
  for (let k = 0; k < count; k++) {
    levels.push(min + ((k + 1) * span) / (count + 1));
  }
  return levels;
}
