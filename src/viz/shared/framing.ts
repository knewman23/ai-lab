export interface Framing {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

/** The x and y extent a scene draws over, in world units. */
export interface Domain {
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
}

/** Camera offset from the target, in units of the domain's larger half-width. */
const OFFSET: readonly [number, number, number] = [2, -2.3, 1.7];

/**
 * The "home" camera for a scene: looking at the centre of its domain at the
 * middle of its drawn height range, from three-quarters above and to one side.
 *
 * Scaling the offset by the larger of the two domain half-widths keeps a wide
 * surface (Himmelblau) and a narrow one (Rosenbrock) equally in frame.
 */
export function frameFor(domain: Domain, heightRange: readonly [number, number]): Framing {
  const [x0, x1] = domain.x;
  const [y0, y1] = domain.y;
  const [zMin, zMax] = heightRange;

  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const cz = (zMin + zMax) / 2;
  const halfExtent = Math.max((x1 - x0) / 2, (y1 - y0) / 2);

  return {
    target: [cx, cy, cz],
    position: [
      cx + halfExtent * OFFSET[0],
      cy + halfExtent * OFFSET[1],
      cz + halfExtent * OFFSET[2],
    ],
  };
}
