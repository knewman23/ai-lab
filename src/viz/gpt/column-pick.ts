import {
  BoxGeometry,
  type Camera,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Raycaster,
  Vector2,
} from "three";
import { CLICK_MS, CLICK_SLOP_PX } from "../shared/drag";
import { BAND_Z, COLUMN_X, columnX, GLYPH_MAX } from "./layout";

export interface ColumnPickOptions {
  canvas: HTMLElement;
  camera: Camera;
  /** The pick volumes, in column order: `onSelect` reports the index into this array. */
  targets: readonly Object3D[];
  onSelect(index: number): void;
}

/**
 * Click-to-select-a-column: a press and release close together in space and time, both over the
 * same column's pick volume, select it. The bounds are `shared/drag.ts`'s own, imported rather
 * than restated, so a press that selects a column and a press that turns the camera part company
 * at exactly the same point. Anything longer or further is an orbit and is left to OrbitControls,
 * which is why the press is heard in the capture phase — the hit test must run before
 * OrbitControls' own pointerdown handler, whatever order the two were registered in.
 *
 * Returns a disposer that removes every listener.
 */
export function createColumnPick(opts: ColumnPickOptions): () => void {
  const { canvas, camera } = opts;
  // Copied to a mutable array once: three's raycaster takes Object3D[].
  const targets = [...opts.targets];
  const raycaster = new Raycaster();
  const ndc = new Vector2();

  /** The press being tracked, with the column it landed on. */
  let candidate: { id: number; x: number; y: number; t: number; index: number } | null = null;

  /** Index of the nearest target under the pointer, or -1 for none. */
  function pick(event: PointerEvent): number {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const object = raycaster.intersectObjects(targets, false)[0]?.object;
    return object ? targets.indexOf(object) : -1;
  }

  function onPointerDown(event: PointerEvent): void {
    const index = pick(event);
    if (index < 0) {
      candidate = null;
      return;
    }
    candidate = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      t: performance.now(),
      index,
    };
  }

  function onPointerUp(event: PointerEvent): void {
    const press = candidate;
    candidate = null;
    if (press === null || press.id !== event.pointerId) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (dx * dx + dy * dy > CLICK_SLOP_PX * CLICK_SLOP_PX) return;
    if (performance.now() - press.t > CLICK_MS) return;
    opts.onSelect(press.index);
  }

  function onPointerCancel(event: PointerEvent): void {
    if (candidate?.id === event.pointerId) candidate = null;
  }

  canvas.addEventListener("pointerdown", onPointerDown, true);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown, true);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    candidate = null;
  };
}

export interface ColumnHits {
  /** One pick volume per column, in sequence order; the caller adds them to its own group. */
  readonly targets: readonly Mesh[];
  /** Releases the shared geometry and material; the meshes belong to the caller. */
  dispose(): void;
}

/** Narrower than the 1.2 column pitch, and thin in the depth the wall has none of. */
const HIT_W = 0.9;
const HIT_D = 0.4;
/** Spans the column's line with a glyph's reach at either end, so every glyph is grabbable. */
const HIT_H = BAND_Z.mlp - BAND_Z.embed + 2 * GLYPH_MAX;
const HIT_CZ = (BAND_Z.embed + BAND_Z.mlp) / 2;

/**
 * The five click targets, as in `backprop/hit-boxes.ts`: an invisible *material* on a *visible*
 * mesh, so the raycast hits them whichever way three treats invisible objects. That pool's
 * `PARKED_LAYER` trick has no counterpart here — the scene has exactly five columns at every
 * sentence, so no box is ever surplus and needs taking off the raycast's layer.
 */
export function createColumnHits(): ColumnHits {
  const geometry = new BoxGeometry(HIT_W, HIT_D, HIT_H);
  const material = new MeshBasicMaterial({ visible: false });
  const targets = COLUMN_X.map((_, i) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(columnX(i), 0, HIT_CZ);
    return mesh;
  });

  return {
    targets,
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
