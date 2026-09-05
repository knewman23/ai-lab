import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
} from "three";
import { disposeLayers, type Layer, lineLayer } from "../shared/layer";
import { writeWorldSegments } from "../shared/layer-write";
import type { ThemeColors } from "../types";
import { BAR_BUFFER_FLOATS, leaderSegment, writeBars } from "./bars-geometry";

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

/** The bars sort with the columns' glyphs, above the wall and the arcs. */
const BAR_ORDER = 10;

/**
 * Eight bars across the logits band, one per vocabulary word in vocabulary order, over a buffer
 * preallocated for the whole row so a new distribution rewrites vertices rather than rebuilding
 * geometry. The shape of a bar and the height law are `bars-geometry.ts`'s.
 */
export function createBars(theme: ThemeColors): Bars {
  const positions = new Float32Array(BAR_BUFFER_FLOATS);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  // Every bar lies in a plane of constant y, so one normal serves the whole buffer. It is never
  // flipped per triangle: WebGPU's DoubleSide path already multiplies by faceDirection, and
  // negating here would light the back faces inside out.
  const normals = new Float32Array(BAR_BUFFER_FLOATS);
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
  writeWorldSegments(leader, [leaderSegment()]);

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
      const count = writeBars(positions, probabilities);
      geometry.getAttribute("position").needsUpdate = true;
      geometry.setDrawRange(0, count);
      geometry.computeBoundingSphere();
      mesh.visible = count > 0;
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
