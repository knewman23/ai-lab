import { Group } from "three";
import { Z0 } from "../../core/math/functions1d";
import type { ThemeColors } from "../types";
import { disposeLayers, lineLayer } from "../shared/layer";
import { writePoints } from "../shared/layer-write";
import { CLIP } from "./clip";

export interface Axes {
  readonly group: Group;
  /** Hides everything the zoomed view has no meaning for: band axis, ticks, separator. */
  setZoomed(on: boolean): void;
  dispose(): void;
}

/** Half-width of the drawn x axes and half-height of the main region's Z axis. */
const [HALF_X, HALF_Z] = CLIP;
/** Half-height of a unit tick on the main x axis. */
const TICK = 0.08;
/**
 * The separator between the main region and the derivative band. It sits above
 * the band's top (-3.5) and clear of the tangent's clip at -3.4.
 */
const SEPARATOR_Z = -3.45;
const ORDER = 1;

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
  const main = lineLayer(4, ORDER);
  writePoints(main, [
    [-HALF_X, 0],
    [HALF_X, 0],
    [0, -HALF_Z],
    [0, HALF_Z],
  ]);

  // Domain-only: the band's axis and the unit ticks that scale the domain.
  const bandPoints: (readonly [number, number])[] = [[-HALF_X, Z0], [HALF_X, Z0], ...tickPoints()];
  const band = lineLayer(bandPoints.length, ORDER);
  writePoints(band, bandPoints);

  const separator = lineLayer(2, ORDER);
  writePoints(separator, [
    [-HALF_X, SEPARATOR_Z],
    [HALF_X, SEPARATOR_Z],
  ]);

  const layers = [main, band, separator];
  const group = new Group();
  group.add(main.object, band.object, separator.object);

  function applyTheme(): void {
    main.material.color.copy(theme.line);
    band.material.color.copy(theme.line);
    separator.material.color.copy(theme.faint);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

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
      disposeLayers(layers);
    },
  };
}
