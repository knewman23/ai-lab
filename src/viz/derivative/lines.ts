import { Group } from "three";
import { clipSegment } from "../../core/math/matrix2";
import type { ThemeColors } from "../types";
import { commit, disposeLayers, lineLayer, type Layer } from "../shared/layer";
import { CLIP } from "./clip";

/** The point and the two lines read off it, in display coordinates. */
export interface LinesInput {
  readonly px: number;
  readonly pz: number;
  /** Display slope of the tangent, "vertical" for an infinite one, null for none. */
  readonly tangentSlope: number | "vertical" | null;
  /** The second point of the secant, or null when there is no usable one. */
  readonly secant: { readonly x: number; readonly z: number } | null;
}

export interface TangentSecant {
  readonly group: Group;
  set(input: LinesInput): void;
  setShow(show: { tangent: boolean; secant: boolean }): void;
  dispose(): void;
}

/**
 * Half-length of the pre-clip secant, long enough to cross the box from any
 * point inside it whatever direction it runs.
 */
const REACH = 20;
const SECANT_OPACITY = 0.8;
const SECANT_ORDER = 4;
const TANGENT_ORDER = 5;
/** Below this the two secant points coincide and there is no direction to draw. */
const ZERO = 1e-9;

/**
 * The tangent at the point and the secant through it, each a single segment
 * clipped to the display box so a steep line stops at the separator instead of
 * running down through the derivative band.
 *
 * Whether a line exists is decided here from the geometry and remembered, so
 * `setShow` can toggle the overlay without resurrecting a line that has none:
 * a jump has no tangent, and a degenerate step has no secant.
 */
export function createTangentSecant(theme: ThemeColors): TangentSecant {
  const secant = lineLayer(2, SECANT_ORDER);
  secant.material.opacity = SECANT_OPACITY;
  const tangent = lineLayer(2, TANGENT_ORDER);

  const group = new Group();
  group.add(secant.object, tangent.object);

  let hasTangent = false;
  let hasSecant = false;
  let showTangent = true;
  let showSecant = true;

  function applyTheme(): void {
    tangent.material.color.copy(theme.accent);
    secant.material.color.copy(theme.soft);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  function applyVisibility(): void {
    tangent.object.visible = hasTangent && showTangent;
    secant.object.visible = hasSecant && showSecant;
  }

  function write(layer: Layer, ax: number, az: number, bx: number, bz: number): void {
    layer.positions[0] = ax;
    layer.positions[2] = az;
    layer.positions[3] = bx;
    layer.positions[5] = bz;
    commit(layer, 2);
  }

  /** Clips [a, b] to the display box and writes it; returns false if it misses. */
  function writeClipped(
    layer: Layer,
    a: readonly [number, number],
    b: readonly [number, number],
  ): boolean {
    const clipped = clipSegment(a, b, CLIP);
    if (clipped === null) return false;
    write(layer, clipped[0][0], clipped[0][1], clipped[1][0], clipped[1][1]);
    return true;
  }

  return {
    group,

    set(input: LinesInput): void {
      const { px, pz, tangentSlope } = input;

      if (tangentSlope === null) {
        hasTangent = false;
      } else if (tangentSlope === "vertical") {
        // No slope to extend along: the line is X = px over the box's height.
        write(tangent, px, -CLIP[1], px, CLIP[1]);
        hasTangent = true;
      } else {
        hasTangent = writeClipped(
          tangent,
          [-CLIP[0], pz + tangentSlope * (-CLIP[0] - px)],
          [CLIP[0], pz + tangentSlope * (CLIP[0] - px)],
        );
      }

      if (input.secant === null) {
        hasSecant = false;
      } else {
        // Extending along the direction rather than to X = ±3.5 keeps a
        // near-vertical secant honest: it reaches the box top, not infinity.
        const dx = input.secant.x - px;
        const dz = input.secant.z - pz;
        const length = Math.hypot(dx, dz);
        hasSecant =
          length >= ZERO &&
          writeClipped(
            secant,
            [px - (REACH * dx) / length, pz - (REACH * dz) / length],
            [px + (REACH * dx) / length, pz + (REACH * dz) / length],
          );
      }

      applyVisibility();
    },

    setShow(show: { tangent: boolean; secant: boolean }): void {
      showTangent = show.tangent;
      showSecant = show.secant;
      applyVisibility();
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      disposeLayers([secant, tangent]);
    },
  };
}
