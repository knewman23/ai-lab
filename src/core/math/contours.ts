/**
 * Marching squares contour extraction and contour level generation.
 *
 * Grid convention: `grid[j * nx + i]` is the sample value at column `i`,
 * row `j` (0-based, `i` in `[0, nx)`, `j` in `[0, ny)`). Returned segment
 * coordinates are in grid index space (fractional `i`, `j`); callers map
 * that space onto world coordinates.
 */

/** Interpolated x where the value crosses `level` along a horizontal edge (fixed y). */
function interpX(level: number, v0: number, v1: number, x0: number, x1: number): number {
  return x0 + ((level - v0) / (v1 - v0)) * (x1 - x0);
}

/** Interpolated y where the value crosses `level` along a vertical edge (fixed x). */
function interpY(level: number, v0: number, v1: number, y0: number, y1: number): number {
  return y0 + ((level - v0) / (v1 - v0)) * (y1 - y0);
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

      switch (caseIndex) {
        case 1:
        case 14: {
          const leftY = interpY(level, a, d, j, j + 1);
          const bottomX = interpX(level, a, b, i, i + 1);
          out.push(i, leftY, bottomX, j);
          break;
        }
        case 2:
        case 13: {
          const bottomX = interpX(level, a, b, i, i + 1);
          const rightY = interpY(level, b, c, j, j + 1);
          out.push(bottomX, j, i + 1, rightY);
          break;
        }
        case 3:
        case 12: {
          const leftY = interpY(level, a, d, j, j + 1);
          const rightY = interpY(level, b, c, j, j + 1);
          out.push(i, leftY, i + 1, rightY);
          break;
        }
        case 4:
        case 11: {
          const rightY = interpY(level, b, c, j, j + 1);
          const topX = interpX(level, d, c, i, i + 1);
          out.push(i + 1, rightY, topX, j + 1);
          break;
        }
        case 6:
        case 9: {
          const bottomX = interpX(level, a, b, i, i + 1);
          const topX = interpX(level, d, c, i, i + 1);
          out.push(bottomX, j, topX, j + 1);
          break;
        }
        case 7:
        case 8: {
          const leftY = interpY(level, a, d, j, j + 1);
          const topX = interpX(level, d, c, i, i + 1);
          out.push(i, leftY, topX, j + 1);
          break;
        }
        case 5: {
          const leftY = interpY(level, a, d, j, j + 1);
          const bottomX = interpX(level, a, b, i, i + 1);
          const rightY = interpY(level, b, c, j, j + 1);
          const topX = interpX(level, d, c, i, i + 1);
          const center = (a + b + c + d) / 4;
          if (center > level) {
            out.push(i, leftY, topX, j + 1);
            out.push(bottomX, j, i + 1, rightY);
          } else {
            out.push(i, leftY, bottomX, j);
            out.push(topX, j + 1, i + 1, rightY);
          }
          break;
        }
        case 10: {
          const leftY = interpY(level, a, d, j, j + 1);
          const bottomX = interpX(level, a, b, i, i + 1);
          const rightY = interpY(level, b, c, j, j + 1);
          const topX = interpX(level, d, c, i, i + 1);
          const center = (a + b + c + d) / 4;
          if (center > level) {
            out.push(i, leftY, bottomX, j);
            out.push(topX, j + 1, i + 1, rightY);
          } else {
            out.push(i, leftY, topX, j + 1);
            out.push(bottomX, j, i + 1, rightY);
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
