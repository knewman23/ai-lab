import type { ArrowHelper, Material } from "three";

/** How an arrow should sort against the rest of a scene. */
export interface ArrowOverlay {
  /** Draw order for the line and the cone. */
  readonly renderOrder: number;
  /** Default true. False draws the arrow over everything, whatever the depth. */
  readonly depthTest?: boolean;
  /** Default true when `depthTest` is false, otherwise left alone. */
  readonly depthWrite?: boolean;
  /** Default true: puts the arrow in three's transparent sort group. */
  readonly transparent?: boolean;
}

/** Runs `apply` over whatever material(s) a helper part carries. */
export function eachMaterial(material: Material | Material[], apply: (m: Material) => void): void {
  for (const m of Array.isArray(material) ? material : [material]) apply(m);
}

/**
 * Applies a sort policy to an arrow's line and cone.
 *
 * `renderOrder` goes on those parts rather than the ArrowHelper: three sorts
 * renderable objects individually and a Group's own order is not inherited by
 * its children. `transparent` puts the parts in three's single transparent sort
 * group, so `renderOrder` alone decides the order among the layers there.
 * Turning `depthTest` off draws the arrow over geometry it is buried in, which
 * a scene of solid bodies does not want.
 */
export function overlayArrow(arrow: ArrowHelper, overlay: ArrowOverlay): void {
  const depthTest = overlay.depthTest ?? true;
  const depthWrite = overlay.depthWrite ?? depthTest;
  const transparent = overlay.transparent ?? true;
  for (const part of [arrow.line, arrow.cone]) {
    part.renderOrder = overlay.renderOrder;
    eachMaterial(part.material, (m) => {
      m.depthTest = depthTest;
      m.depthWrite = depthWrite;
      m.transparent = transparent;
    });
  }
}

/** Sets the opacity of an arrow's line and cone, making them transparent. */
export function fadeArrow(arrow: ArrowHelper, opacity: number): void {
  for (const part of [arrow.line, arrow.cone]) {
    eachMaterial(part.material, (m) => {
      m.transparent = true;
      m.opacity = opacity;
    });
  }
}

/**
 * Releases an arrow's own materials. Not `ArrowHelper.dispose()`: that also
 * disposes the line and cone geometries, which three shares across every
 * ArrowHelper in the app, so one disposal would break all the others.
 */
export function disposeArrow(arrow: ArrowHelper): void {
  eachMaterial(arrow.line.material, (m) => m.dispose());
  eachMaterial(arrow.cone.material, (m) => m.dispose());
}
