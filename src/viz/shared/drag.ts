import { Plane, Raycaster, Vector2, Vector3, type Camera, type Object3D } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Vec2 } from "../../core/math/numeric";

export interface DragOptions {
  canvas: HTMLElement;
  camera: Camera;
  controls: OrbitControls;
  /** The grabbable objects, in the order the caller wants them indexed. */
  hitTargets: readonly Object3D[];
  /** Display height of the object at `index`, which fixes the plane it drags on. */
  getPlaneZ(index: number): number;
  /** Keeps a dragged or placed point inside the scene; identity by default. */
  clamp?: (pos: Vec2) => Vec2;
  /**
   * False turns dragging off without detaching: no drag or click-to-place
   * starts, orbit still works and the cursor stays default.
   */
  enabled?(): boolean;
  /** The surface group, raycast for click-to-place when every hit target is missed. */
  surfaceTarget?: Object3D;
  /** `index` is the hit target that moved, or -1 for a click on the surface. */
  onDrag(index: number, pos: Vec2): void;
}

/** A pointerdown that missed the targets counts as a click, not an orbit, within these bounds. */
const CLICK_SLOP_PX = 6;
const CLICK_MS = 400;
/** Re-testing the hover raycast on every pointermove is wasted work at 60 Hz. */
const HOVER_STEP_PX = 4;

const identity = (pos: Vec2): Vec2 => pos;

/**
 * Makes one or more objects draggable: the pointer ray meets a horizontal plane
 * at the grabbed object's current height, which gives (x, y) alone. The caller
 * decides where the object goes from there, so cursor jitter can never lift it
 * off the surface it belongs to. Orbit is suspended for the duration of a drag.
 *
 * A press that misses every target still orbits, but if it ends quickly and
 * near where it began it is treated as a click, and — when the caller gave a
 * `surfaceTarget` — places the point under the cursor with index -1.
 *
 * Returns a disposer that removes every listener and re-enables the controls.
 */
export function attachDrag(opts: DragOptions): () => void {
  const { canvas, camera, controls } = opts;
  // Copied to a mutable array once: three's raycaster takes Object3D[].
  const hitTargets = [...opts.hitTargets];
  const clamp = opts.clamp ?? identity;
  // Restored rather than forced to true, so a viz that keeps orbit off keeps it off.
  const orbitWasEnabled = controls.enabled;

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const dragPlane = new Plane(new Vector3(0, 0, 1), 0);
  const hit = new Vector3();
  let activePointer: number | null = null;
  let activeIndex = -1;

  /** A press that missed the targets, tracked so pointerup can tell click from orbit. */
  let candidate: { id: number; x: number; y: number; t: number } | null = null;
  const lastHover = new Vector2(NaN, NaN);

  function castFrom(event: PointerEvent): void {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
  }

  /** Index of the nearest hit target under the last cast ray, or -1 for none. */
  function pick(): number {
    const object = raycaster.intersectObjects(hitTargets, false)[0]?.object;
    return object ? hitTargets.indexOf(object) : -1;
  }

  function setCursor(value: string): void {
    canvas.style.cursor = value;
  }

  function draggingAllowed(): boolean {
    return opts.enabled?.() ?? true;
  }

  function onPointerDown(event: PointerEvent): void {
    if (activePointer !== null) return;
    castFrom(event);
    const index = draggingAllowed() ? pick() : -1;
    if (index < 0) {
      // Missed: let orbit have the press, but remember it in case the visitor
      // is clicking to place rather than dragging to orbit.
      candidate = { id: event.pointerId, x: event.clientX, y: event.clientY, t: performance.now() };
      return;
    }

    // Plane through the object's height at drag start: constant is -z for normal +Z.
    dragPlane.constant = -opts.getPlaneZ(index);

    candidate = null;
    activePointer = event.pointerId;
    activeIndex = index;
    controls.enabled = false;
    canvas.setPointerCapture(event.pointerId);
    setCursor("grabbing");
  }

  function onPointerMove(event: PointerEvent): void {
    if (activePointer === event.pointerId) {
      castFrom(event);
      if (raycaster.ray.intersectPlane(dragPlane, hit) === null) return;
      opts.onDrag(activeIndex, clamp([hit.x, hit.y]));
      return;
    }
    // Checked ahead of the candidate guard so that turning dragging off clears
    // a "grab" cursor left over from when it was still on.
    if (!draggingAllowed()) {
      if (canvas.style.cursor) setCursor("");
      return;
    }
    if (activePointer !== null || candidate !== null) return;

    const dx = event.clientX - lastHover.x;
    const dy = event.clientY - lastHover.y;
    // NaN on the first move, which compares false, so the first test always runs.
    if (dx * dx + dy * dy < HOVER_STEP_PX * HOVER_STEP_PX) return;
    lastHover.set(event.clientX, event.clientY);

    castFrom(event);
    setCursor(pick() >= 0 ? "grab" : "");
  }

  /**
   * True if the release was close enough in space and time to read as a click.
   * An orbit nudge under the slop counts as one too, by design: it barely moved
   * the camera, so placing the point is the reading the visitor meant.
   */
  function wasClick(event: PointerEvent): boolean {
    if (candidate === null || candidate.id !== event.pointerId) return false;
    const dx = event.clientX - candidate.x;
    const dy = event.clientY - candidate.y;
    return (
      dx * dx + dy * dy <= CLICK_SLOP_PX * CLICK_SLOP_PX &&
      performance.now() - candidate.t <= CLICK_MS
    );
  }

  function placeAt(event: PointerEvent): void {
    const { surfaceTarget } = opts;
    if (!surfaceTarget || !draggingAllowed()) return;
    castFrom(event);
    // Recursive: the group holds the solid mesh and its wireframe sibling.
    const point = raycaster.intersectObject(surfaceTarget, true)[0]?.point;
    if (!point) return;
    opts.onDrag(-1, clamp([point.x, point.y]));
  }

  function onPointerUp(event: PointerEvent): void {
    if (wasClick(event)) placeAt(event);
    candidate = null;
    endDrag(event);
  }

  function endDrag(event: PointerEvent): void {
    if (candidate?.id === event.pointerId) candidate = null;
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    activeIndex = -1;
    controls.enabled = orbitWasEnabled;
    setCursor("");
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  // Capture phase: the hit test must run before OrbitControls' own pointerdown
  // handler, whatever order the two listeners were registered in.
  canvas.addEventListener("pointerdown", onPointerDown, true);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", endDrag);

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown, true);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", endDrag);
    if (activePointer !== null) {
      // The pointer may already be gone (element detached, capture lost).
      try {
        canvas.releasePointerCapture(activePointer);
      } catch {
        // Nothing to release.
      }
    }
    activePointer = null;
    activeIndex = -1;
    candidate = null;
    setCursor("");
    controls.enabled = orbitWasEnabled;
  };
}
