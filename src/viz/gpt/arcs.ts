import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
} from "three";
import type { Forward } from "../../core/math/transformer";
import { disposeLayers, type Layer, lineLayer, type Segment } from "../shared/layer";
import { writeWorldSegments } from "../shared/layer-write";
import type { ThemeColors } from "../types";
import {
  ARC_BUFFER_FLOATS,
  attentionRow,
  crossSegments,
  type Field,
  halfWidths,
  writeArcs,
} from "./arcs-geometry";
import { COLUMN_X } from "./layout";
import type { HeadKey, StageKey } from "./state";

export interface Arcs {
  readonly group: Group;
  /** The ribbon mesh and the buffer it draws from; read by tests. */
  readonly mesh: Mesh;
  readonly material: MeshStandardMaterial;
  readonly positions: Float32Array;
  /** The `×` markers over the keys the causal mask hides, drawn only under the scores focus. */
  readonly markers: Layer;
  /** Redraws the fan for one query position and one head selection. */
  set(f: Forward, query: number, head: HeadKey): void;
  /** Under `scores` the ribbons take their width from the raw scores and the mask is marked. */
  setFocus(stage: StageKey): void;
  dispose(): void;
}

/** The arcs sit in front of the wall; the markers and the columns' glyphs sit in front of them. */
const ARC_ORDER = 8;
const MARKER_ORDER = 9;

/**
 * Endpoints the marker layer can need: two strokes of two ends at every column. Counted from the
 * columns rather than from `MAX_ARCS`, which means "arcs drawn at once" and is equal only by
 * coincidence — a smaller `MAX_ARCS` would under-allocate this buffer with nothing to catch it
 * until `writeWorldSegments` overran at draw time.
 */
const MARKER_ENDPOINTS = COLUMN_X.length * 4;

/**
 * The attention arcs: for the selected query column, one ribbon fanning back to every key it
 * reads, its thickness the attention weight. The ribbons are one mesh over a buffer preallocated
 * for all five, so a query change rewrites vertices rather than rebuilding geometry.
 */
export function createArcs(theme: ThemeColors): Arcs {
  const positions = new Float32Array(ARC_BUFFER_FLOATS);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  // Every ribbon lies in a plane of constant y, so one normal serves the whole buffer. It is
  // never flipped per triangle: WebGPU's DoubleSide path already multiplies by faceDirection,
  // and negating here would light the back faces inside out.
  const normals = new Float32Array(ARC_BUFFER_FLOATS);
  for (let n = 1; n < normals.length; n += 3) normals[n] = 1;
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setDrawRange(0, 0);

  const material = new MeshStandardMaterial({ side: DoubleSide, roughness: 0.5 });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = ARC_ORDER;

  const markers = lineLayer(MARKER_ENDPOINTS, MARKER_ORDER, { depth: true });

  const group = new Group();
  group.add(mesh, markers.object);

  function applyTheme(): void {
    material.color.copy(theme.accent);
    // `--soft`, not `--line`, which is near-invisible against the translucent wall.
    markers.material.color.copy(theme.soft);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  /** What the arcs currently show; null until the first `set`. */
  let shown: { f: Forward; query: number; head: HeadKey } | null = null;
  let stage: StageKey = "all";

  function redraw(): void {
    const field: Field = stage === "scores" ? "scores" : "weights";
    let count = 0;
    const strokes: Segment[] = [];
    if (shown !== null) {
      const row = attentionRow(shown.f, shown.query, shown.head, field);
      count = writeArcs(positions, shown.query, halfWidths(row, field));
      // The mask leaves no sentinel behind: the row simply stops, so the keys past its end are
      // exactly the ones the query cannot see.
      if (field === "scores") {
        for (let j = row.length; j < shown.f.x.length; j++) strokes.push(...crossSegments(j));
      }
    }
    geometry.getAttribute("position").needsUpdate = true;
    geometry.setDrawRange(0, count);
    geometry.computeBoundingSphere();
    // WebGPU warns on a draw with zero vertices, so an empty fan is skipped outright.
    mesh.visible = count > 0;
    writeWorldSegments(markers, strokes);
  }
  redraw();

  return {
    group,
    mesh,
    material,
    positions,
    markers,

    set(f, query, head): void {
      shown = { f, query, head };
      redraw();
    },

    setFocus(next): void {
      // Every band of the scene gets the same focus, so this lands on each of them on every
      // change; only the one that actually moved should pay for a rewrite.
      if (next === stage) return;
      stage = next;
      redraw();
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      geometry.dispose();
      material.dispose();
      disposeLayers([markers]);
    },
  };
}
