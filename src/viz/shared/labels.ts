import { Vector3, type Camera } from "three";
import { declutter, type LabelBox } from "./declutter";
import { boxOf, type Measured } from "./label-box";
import type { Vec3 } from "./layer";

/** What a label names; each kind is a CSS class on its span (see `.viz-labels` in panel.css). */
export type LabelKind = "node" | "op" | "value" | "grad" | "edge";

/** An HTML overlay of text labels pinned to world-space points. */
export interface LabelLayer {
  /** Creates the label `id` or rewrites it in place; the span keeps its identity across calls. */
  set(id: string, text: string, world: Vec3, kind: LabelKind): void;
  remove(id: string): void;
  /**
   * Reprojects every label for a canvas of `w` x `h` CSS pixels. Call it after
   * the controls update and before rendering so labels never lag the orbit; a
   * zero-sized canvas is skipped.
   */
  update(camera: Camera, w: number, h: number): void;
  /** Removes every label but keeps the overlay. */
  clear(): void;
  /** Removes the overlay from its host. */
  dispose(): void;
}

/** How the overlay is set up; every field is opt-in, so a scene may pass nothing at all. */
export interface LabelLayerOptions {
  /**
   * Turns on the declutter pass: the rank of a label id, lower being the one that stays when two
   * labels would print over each other. Without it every label is drawn wherever it lands.
   */
  readonly rank?: (id: string) => number;
}

interface Entry extends Measured {
  world: Vec3;
  /** The last written pixel position, so the transform is only touched when it moves. */
  px: number;
  py: number;
}

/** One label and the point it projected to this frame, carried through the declutter pass. */
interface Pending extends LabelBox {
  readonly entry: Entry;
  readonly px: number;
  readonly py: number;
}

/** Anchors: `op` labels sit centred on their point; everything else hangs its baseline above it. */
const ANCHOR_OP = "translate(-50%, -50%)";
const ANCHOR_ABOVE = "translate(-50%, -100%)";

const scratch = new Vector3();

/** Writes a label's transform, leaving it alone when it already sits on that pixel. */
function place(entry: Entry, px: number, py: number): void {
  if (px === entry.px && py === entry.py) return;
  entry.px = px;
  entry.py = py;
  const anchor = entry.el.className === "op" ? ANCHOR_OP : ANCHOR_ABOVE;
  entry.el.style.transform = `${anchor} translate(${String(px)}px, ${String(py)}px)`;
}

/**
 * The CSS pixel position of a world point on a `w` x `h` canvas, or null when
 * it would be behind the camera (projected |z| > 1) or outside the canvas
 * (|x| or |y| > 1 in NDC). The camera's matrices must be current.
 */
export function projectToPixels(
  world: Vec3,
  camera: Camera,
  w: number,
  h: number,
): readonly [number, number] | null {
  scratch.set(world[0], world[1], world[2]).project(camera);
  const { x, y, z } = scratch;
  if (Math.abs(z) > 1 || Math.abs(x) > 1 || Math.abs(y) > 1) return null;
  return [((x + 1) / 2) * w, ((1 - y) / 2) * h];
}

/**
 * Appends a `div.viz-labels` overlay to `host` (which must be positioned, like
 * `.viz-canvas`) and returns the layer that manages spans inside it. Text is
 * kept as HTML rather than sprites so it follows the theme through CSS.
 */
export function createLabelLayer(host: HTMLElement, options?: LabelLayerOptions): LabelLayer {
  const rankOf = options?.rank;
  const root = document.createElement("div");
  root.className = "viz-labels";
  host.append(root);

  const entries = new Map<string, Entry>();

  return {
    set(id, text, world, kind): void {
      const existing = entries.get(id);
      if (existing) {
        if (existing.el.textContent !== text) {
          existing.el.textContent = text;
          existing.w = NaN;
        }
        if (existing.el.className !== kind) {
          // A new kind may mean a new anchor, so force the transform to be rewritten.
          existing.el.className = kind;
          existing.px = NaN;
          existing.w = NaN;
        }
        existing.world = world;
        return;
      }
      const el = document.createElement("span");
      el.className = kind;
      el.textContent = text;
      root.append(el);
      entries.set(id, {
        el,
        world,
        px: NaN,
        py: NaN,
        rank: rankOf === undefined ? NaN : rankOf(id),
        w: NaN,
        h: NaN,
      });
    },

    remove(id): void {
      const entry = entries.get(id);
      if (!entry) return;
      entry.el.remove();
      entries.delete(id);
    },

    update(camera, w, h): void {
      if (w <= 0 || h <= 0) return;
      camera.updateMatrixWorld();
      const pending: Pending[] = [];
      for (const [id, entry] of entries) {
        const p = projectToPixels(entry.world, camera, w, h);
        if (p === null) {
          entry.el.hidden = true;
          continue;
        }
        // Shown before it is measured: a hidden span has no size to read.
        entry.el.hidden = false;
        const px = Math.round(p[0]);
        const py = Math.round(p[1]);
        if (rankOf === undefined) {
          place(entry, px, py);
          continue;
        }
        pending.push({ ...boxOf(id, entry, px, py), entry, px, py });
      }
      // Empty whenever the layer does not declutter, and whenever nothing is on screen. There is
      // no second guard on `rankOf`: two guards on one branch and neither can ever be falsified.
      if (pending.length === 0) return;
      const places = declutter(pending);
      for (const label of pending) {
        const at = places.get(label.id);
        if (at === undefined) {
          label.entry.el.hidden = true;
          continue;
        }
        place(label.entry, label.px + at.dx, label.py + at.dy);
      }
    },

    clear(): void {
      root.replaceChildren();
      entries.clear();
    },

    dispose(): void {
      entries.clear();
      root.remove();
    },
  };
}
