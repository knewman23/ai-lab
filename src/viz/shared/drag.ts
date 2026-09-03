import { Plane, Raycaster, Vector2, Vector3, type Camera, type Object3D } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Vec2 } from "../../core/math/numeric";
import { clampToDomain, type Surface } from "../../core/math/surfaces";

export interface DragOptions {
  canvas: HTMLElement;
  camera: Camera;
  controls: OrbitControls;
  hitTarget: Object3D;
  /** The surface group, raycast for click-to-place when the ball is missed. */
  surfaceTarget: Object3D;
  getSurface(): Surface;
  getPosition(): Vec2;
  onDrag(pos: Vec2): void;
}

/** A pointerdown that missed the ball counts as a click, not an orbit, within these bounds. */
const CLICK_SLOP_PX = 6;
const CLICK_MS = 400;
/** Re-testing the hover raycast on every pointermove is wasted work at 60 Hz. */
const HOVER_STEP_PX = 4;

/**
 * Makes the marker draggable: the pointer ray meets a horizontal plane at the
 * marker's current height, which gives (x, y) alone. The caller decides where
 * the marker goes from there, so cursor jitter can never lift it off the
 * surface. Orbit is suspended for the duration of a drag.
 *
 * A press that misses the ball still orbits, but if it ends quickly and near
 * where it began it is treated as a click and places the marker at the point
 * on the surface under the cursor.
 *
 * Returns a disposer that removes every listener and re-enables the controls.
 */
export function attachDrag(opts: DragOptions): () => void {
  const { canvas, camera, controls, hitTarget, surfaceTarget } = opts;
  // Restored rather than forced to true, so a viz that keeps orbit off keeps it off.
  const orbitWasEnabled = controls.enabled;

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const dragPlane = new Plane(new Vector3(0, 0, 1), 0);
  const hit = new Vector3();
  let activePointer: number | null = null;

  /** A press that missed the ball, tracked so pointerup can tell click from orbit. */
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

  function setCursor(value: string): void {
    canvas.style.cursor = value;
  }

  function onPointerDown(event: PointerEvent): void {
    if (activePointer !== null) return;
    castFrom(event);
    if (raycaster.intersectObject(hitTarget, false).length === 0) {
      // Missed the ball: let orbit have the press, but remember it in case the
      // visitor is clicking to place rather than dragging to orbit.
      candidate = { id: event.pointerId, x: event.clientX, y: event.clientY, t: performance.now() };
      return;
    }

    const surface = opts.getSurface();
    const [x, y] = opts.getPosition();
    // Plane through the marker's height at drag start: constant is -z for normal +Z.
    dragPlane.constant = -surface.scale * surface.f(x, y);

    candidate = null;
    activePointer = event.pointerId;
    controls.enabled = false;
    canvas.setPointerCapture(event.pointerId);
    setCursor("grabbing");
  }

  function onPointerMove(event: PointerEvent): void {
    if (activePointer === event.pointerId) {
      castFrom(event);
      if (raycaster.ray.intersectPlane(dragPlane, hit) === null) return;
      opts.onDrag(clampToDomain(opts.getSurface(), [hit.x, hit.y]));
      return;
    }
    if (activePointer !== null || candidate !== null) return;

    const dx = event.clientX - lastHover.x;
    const dy = event.clientY - lastHover.y;
    // NaN on the first move, which compares false, so the first test always runs.
    if (dx * dx + dy * dy < HOVER_STEP_PX * HOVER_STEP_PX) return;
    lastHover.set(event.clientX, event.clientY);

    castFrom(event);
    setCursor(raycaster.intersectObject(hitTarget, false).length > 0 ? "grab" : "");
  }

  /**
   * True if the release was close enough in space and time to read as a click.
   * An orbit nudge under the slop counts as one too, by design: it barely moved
   * the camera, so placing the marker is the reading the visitor meant.
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
    castFrom(event);
    // Recursive: the group holds the solid mesh and its wireframe sibling.
    const hits = raycaster.intersectObject(surfaceTarget, true);
    const point = hits[0]?.point;
    if (!point) return;
    opts.onDrag(clampToDomain(opts.getSurface(), [point.x, point.y]));
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
    candidate = null;
    setCursor("");
    controls.enabled = orbitWasEnabled;
  };
}
