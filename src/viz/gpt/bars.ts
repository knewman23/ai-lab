import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
} from "three";
import { VOCAB } from "../../core/math/transformer";
import { disposeLayers, type Layer, lineLayer, type Segment } from "../shared/layer";
import { writeWorldSegments } from "../shared/layer-write";
import type { ThemeColors } from "../types";
import { BAND_Z, columnX, COLUMN_X, GLYPH_MAX } from "./layout";

export interface Bars {
  readonly group: Group;
  /** The bar mesh and the buffer it draws from; read by tests. */
  readonly mesh: Mesh;
  readonly geometry: BufferGeometry;
  readonly material: MeshStandardMaterial;
  readonly positions: Float32Array;
  /** The line joining the last token's column to the row, so the bars read as belonging to it. */
  readonly leader: Layer;
  /** Redraws the row from a distribution over the eight words. */
  set(probabilities: Float64Array): void;
  dispose(): void;
}

/** How wide each bar is, and how far apart their centres sit. */
const BAR_WIDTH = 0.28;
const BAR_PITCH = 0.7;

/**
 * How far in front of the wall the bars float: past the band lines' 0.01 and the columns' 0.02,
 * so a bar standing on the logits band never z-fights the line it stands on.
 */
const LIFT = -0.03;

/** The bars sort with the columns' glyphs, above the wall and the arcs. */
const BAR_ORDER = 10;

/** Two triangles, three vertices each, per bar. */
const VERTICES_PER_BAR = 6;
/** Floats the mesh preallocates. A multiple of 3, or `computeBoundingSphere` reads past it. */
const BUFFER_FLOATS = VOCAB.length * VERTICES_PER_BAR * 3;

/** The token whose column the leader line leaves: the last one, whose logits these are. */
const LAST_COLUMN = COLUMN_X.length - 1;

/** Centre x of the bar for word `v`. Throws rather than defaulting: there are exactly eight. */
export function barX(v: number): number {
  if (!Number.isInteger(v) || v < 0 || v >= VOCAB.length) {
    throw new Error(`gpt bars: no bar ${v}; there are ${VOCAB.length} words`);
  }
  return (v - (VOCAB.length - 1) / 2) * BAR_PITCH;
}

/**
 * The largest probability in the row, which every bar is measured against. Throws rather than
 * defaulting: a distribution of the wrong length, or with no mass in it, is a bug upstream and
 * would silently draw eight bars of nothing.
 */
function peak(probabilities: Float64Array): number {
  if (probabilities.length !== VOCAB.length) {
    throw new Error(`gpt bars: ${probabilities.length} probabilities for ${VOCAB.length} words`);
  }
  let max = 0;
  for (let v = 0; v < probabilities.length; v++) {
    const p = probabilities[v];
    if (p === undefined) throw new Error(`gpt bars: no probability ${v}`);
    if (p > max) max = p;
  }
  if (!(max > 0)) throw new Error("gpt bars: the distribution carries no mass");
  return max;
}

/**
 * Eight bars across the logits band, one per vocabulary word in vocabulary order, each
 * `0.28` wide and `GLYPH_MAX * p / max(p)` tall so the tallest always fills the band whatever
 * the temperature has done to the distribution. The top of the tallest is 4.75, inside the
 * wall's 5.2 with room for the label pill above it.
 */
export function createBars(theme: ThemeColors): Bars {
  const positions = new Float32Array(BUFFER_FLOATS);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  // Every bar lies in a plane of constant y, so one normal serves the whole buffer. It is never
  // flipped per triangle: WebGPU's DoubleSide path already multiplies by faceDirection, and
  // negating here would light the back faces inside out.
  const normals = new Float32Array(BUFFER_FLOATS);
  for (let n = 1; n < normals.length; n += 3) normals[n] = 1;
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setDrawRange(0, 0);

  const material = new MeshStandardMaterial({ side: DoubleSide, roughness: 0.5 });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = BAR_ORDER;
  // WebGPU warns on a draw with zero vertices, so the row stays hidden until the first `set`.
  mesh.visible = false;

  // `--soft`, not `--line`, which is near-invisible against the translucent wall.
  const leader = lineLayer(2, BAR_ORDER, { depth: true });
  const stem: Segment = [
    [columnX(LAST_COLUMN), LIFT, BAND_Z.mlp],
    [columnX(LAST_COLUMN), LIFT, BAND_Z.logits],
  ];
  writeWorldSegments(leader, [stem]);

  const group = new Group();
  group.add(mesh, leader.object);

  function applyTheme(): void {
    material.color.copy(theme.accent);
    leader.material.color.copy(theme.soft);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  return {
    group,
    mesh,
    geometry,
    material,
    positions,
    leader,

    set(probabilities): void {
      const max = peak(probabilities);
      let n = 0;
      for (let v = 0; v < VOCAB.length; v++) {
        const p = probabilities[v];
        if (p === undefined) throw new Error(`gpt bars: no probability ${v}`);
        const left = barX(v) - BAR_WIDTH / 2;
        const right = left + BAR_WIDTH;
        const base = BAND_Z.logits;
        const top = base + (GLYPH_MAX * p) / max;
        // Two triangles wound the same way in every bar, whatever the heights are.
        const quad: readonly (readonly [number, number])[] = [
          [left, base],
          [right, base],
          [left, top],
          [right, base],
          [right, top],
          [left, top],
        ];
        for (const [x, z] of quad) {
          positions.set([x, LIFT, z], n * 3);
          n++;
        }
      }
      geometry.getAttribute("position").needsUpdate = true;
      geometry.setDrawRange(0, n);
      geometry.computeBoundingSphere();
      mesh.visible = n > 0;
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      geometry.dispose();
      material.dispose();
      disposeLayers([leader]);
    },
  };
}
