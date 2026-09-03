import { BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineSegments } from "three";
import { Z0 } from "../../core/math/functions1d";
import type { ThemeColors } from "../types";

export interface Axes {
  readonly group: Group;
  /** Hides everything the zoomed view has no meaning for: band axis, ticks, separator. */
  setZoomed(on: boolean): void;
  dispose(): void;
}

/** Half-width of the drawn x axes, matching the display clip box. */
const HALF_X = 3.5;
/** Half-height of the main region's Z axis, matching the display clip box. */
const HALF_Z = 3.4;
/** Half-height of a unit tick on the main x axis. */
const TICK = 0.08;
/**
 * The separator between the main region and the derivative band. It sits above
 * the band's top (-3.5) and clear of the tangent's clip at -3.4.
 */
const SEPARATOR_Z = -3.45;
const ORDER = 1;

/** One flat line layer over a buffer of (X, Z) endpoint pairs in the plane y = 0. */
function lineLayer(points: readonly (readonly [number, number])[]): {
  readonly object: LineSegments;
  readonly geometry: BufferGeometry;
  readonly material: LineBasicMaterial;
} {
  const positions = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    positions[i * 3] = points[i]![0];
    positions[i * 3 + 2] = points[i]![1];
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  const material = new LineBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const object = new LineSegments(geometry, material);
  object.renderOrder = ORDER;
  return { object, geometry, material };
}

/** The unit ticks on the main x axis, skipping the origin where the Z axis already is. */
function tickPoints(): (readonly [number, number])[] {
  const points: (readonly [number, number])[] = [];
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    points.push([i, -TICK], [i, TICK]);
  }
  return points;
}

/**
 * The scene's static rules: the x and Z axes of the main region, the x axis the
 * derivative band is read against, unit ticks, and the faint separator between
 * the two regions.
 *
 * Everything but the main region's own axes is meaningless once the view zooms
 * into a window around the point, so `setZoomed` hides it rather than leaving a
 * band the zoomed curve does not belong to.
 */
export function createAxes(theme: ThemeColors): Axes {
  // Always drawn: the main region's own frame of reference.
  const main = lineLayer([
    [-HALF_X, 0],
    [HALF_X, 0],
    [0, -HALF_Z],
    [0, HALF_Z],
  ]);

  // Domain-only: the band's axis and the unit ticks that scale the domain.
  const band = lineLayer([[-HALF_X, Z0], [HALF_X, Z0], ...tickPoints()]);

  const separator = lineLayer([
    [-HALF_X, SEPARATOR_Z],
    [HALF_X, SEPARATOR_Z],
  ]);

  const group = new Group();
  group.add(main.object, band.object, separator.object);

  function applyTheme(): void {
    main.material.color.copy(theme.line);
    band.material.color.copy(theme.line);
    separator.material.color.copy(theme.faint);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  const layers = [main, band, separator];

  return {
    group,

    setZoomed(on: boolean): void {
      band.object.visible = !on;
      separator.object.visible = !on;
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
    },
  };
}
