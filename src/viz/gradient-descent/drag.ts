import { Plane, Raycaster, Vector2, Vector3, type Camera, type Object3D } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Vec2 } from "../../core/math/numeric";
import { clampToDomain, type Surface } from "../../core/math/surfaces";

export interface DragOptions {
  canvas: HTMLElement;
  camera: Camera;
  controls: OrbitControls;
  hitTarget: Object3D;
  getSurface(): Surface;
  getPosition(): Vec2;
  onDrag(pos: Vec2): void;
}

/**
 * Makes the marker draggable: the pointer ray meets a horizontal plane at the
 * marker's current height, which gives (x, y) alone. The caller decides where
 * the marker goes from there, so cursor jitter can never lift it off the
 * surface. Orbit is suspended for the duration of a drag.
 *
 * Returns a disposer that removes every listener and re-enables the controls.
 */
export function attachDrag(opts: DragOptions): () => void {
  const { canvas, camera, controls, hitTarget } = opts;
  // Restored rather than forced to true, so a viz that keeps orbit off keeps it off.
  const orbitWasEnabled = controls.enabled;

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const dragPlane = new Plane(new Vector3(0, 0, 1), 0);
  const hit = new Vector3();
  let activePointer: number | null = null;

  function castFrom(event: PointerEvent): void {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
  }

  function onPointerDown(event: PointerEvent): void {
    if (activePointer !== null) return;
    castFrom(event);
    if (raycaster.intersectObject(hitTarget, false).length === 0) return;

    const surface = opts.getSurface();
    const [x, y] = opts.getPosition();
    // Plane through the marker's height at drag start: constant is -z for normal +Z.
    dragPlane.constant = -surface.scale * surface.f(x, y);

    activePointer = event.pointerId;
    controls.enabled = false;
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (activePointer !== event.pointerId) return;
    castFrom(event);
    if (raycaster.ray.intersectPlane(dragPlane, hit) === null) return;
    opts.onDrag(clampToDomain(opts.getSurface(), [hit.x, hit.y]));
  }

  function endDrag(event: PointerEvent): void {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    controls.enabled = orbitWasEnabled;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  // Capture phase: the hit test must run before OrbitControls' own pointerdown
  // handler, whatever order the two listeners were registered in.
  canvas.addEventListener("pointerdown", onPointerDown, true);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown, true);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", endDrag);
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
    controls.enabled = orbitWasEnabled;
  };
}
