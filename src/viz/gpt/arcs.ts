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
  arcHalfWidth,
  crossSegments,
  MAX_ARCS,
  writeArcs,
} from "./arcs-geometry";
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

/** Which row of a head the ribbons are measuring. */
type Field = "weights" | "scores";

/**
 * How much of each head's attention row survives into `attnOut`. `W_O` scales head 1 by 0.6 and
 * head 2 by 0.4, *and* head 2's `W_V = 0.8 I` shrinks its values first, so head 2's effective
 * coefficient is 0.32 and the blend sums to 0.92. It is a contribution, not a distribution;
 * writing 0.6 a¹ + 0.4 a² would overstate the second head.
 */
const BLEND = { head1: 0.6, head2: 0.32 } as const;

/** The arcs sit in front of the wall; the markers and the columns' glyphs sit in front of them. */
const ARC_ORDER = 8;
const MARKER_ORDER = 9;

/** Endpoints the marker layer can need: two strokes of two ends at every masked column. */
const MARKER_ENDPOINTS = MAX_ARCS * 4;

/** One head's row for `query`. Throws rather than defaulting: a short row is a bug, not a blank. */
function headRow(f: Forward, index: 0 | 1, query: number, field: Field): Float64Array {
  const head = f.heads[index];
  if (head === undefined) throw new Error(`gpt arcs: the pass has no head ${index + 1}`);
  const row = head[field][query];
  if (row === undefined) {
    throw new Error(`gpt arcs: head ${index + 1} has no ${field} row ${query}`);
  }
  return row;
}

/**
 * The row the ribbons are sized from. `both` combines the two heads by their `BLEND`
 * coefficients — for the scores as well, so the focus switch changes what is measured and not
 * which heads are shown.
 */
function attentionRow(f: Forward, query: number, head: HeadKey, field: Field): number[] {
  if (head === "head1") return [...headRow(f, 0, query, field)];
  if (head === "head2") return [...headRow(f, 1, query, field)];
  const first = headRow(f, 0, query, field);
  const second = headRow(f, 1, query, field);
  return [...first].map((value, j) => {
    const other = second[j];
    if (other === undefined) {
      throw new Error(`gpt arcs: the two heads' ${field} rows disagree in length at key ${j}`);
    }
    return BLEND.head1 * value + BLEND.head2 * other;
  });
}

/**
 * Ribbon half-widths for a row. Weights are already in 0..1 and go through unchanged; raw scores
 * are unbounded and are min-max normalised across the row first. A row whose scores are all equal
 * has no spread to show and draws at full width, as the single-key row of query 0 does.
 */
function halfWidths(row: readonly number[], normalise: boolean): number[] {
  if (!normalise) return row.map((weight) => arcHalfWidth(weight));
  const lo = Math.min(...row);
  const span = Math.max(...row) - lo;
  return row.map((score) => arcHalfWidth(span > 0 ? (score - lo) / span : 1));
}

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
    const scores = stage === "scores";
    let count = 0;
    const strokes: Segment[] = [];
    if (shown !== null) {
      const row = attentionRow(shown.f, shown.query, shown.head, scores ? "scores" : "weights");
      count = writeArcs(positions, shown.query, halfWidths(row, scores));
      // The mask leaves no sentinel behind: the row simply stops, so the keys past its end are
      // exactly the ones the query cannot see.
      if (scores) {
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
