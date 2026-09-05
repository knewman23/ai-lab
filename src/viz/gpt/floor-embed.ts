import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
} from "three";
import type { Vec2 } from "../../core/math/numeric";
import { type Embeddings, VOCAB } from "../../core/math/transformer";
import { disposeLayers, type Layer, lineLayer, type Segment, type Vec3 } from "../shared/layer";
import { writeWorldSegments } from "../shared/layer-write";
import type { ThemeColors } from "../types";
import { FLOOR_X, FLOOR_Y, floorFromEmbed } from "./layout";

export interface FloorEmbed {
  readonly group: Group;
  /**
   * The floor rectangle, and the drag's `surfaceTarget`: `drag.ts` raycasts that one
   * recursively, so it must be the bare plane and never a group the spheres hang under.
   */
  readonly mesh: Mesh;
  /** The eight vocabulary spheres in vocabulary order: the drag's hit targets. */
  readonly hitTargets: readonly Mesh[];
  /** The unembedding rays, split by colour: the winning word's, and everyone else's. */
  readonly rays: Readonly<{ soft: Layer; accent: Layer }>;
  /** Moves the words and re-picks which ray is the winner's. */
  set(embeddings: Embeddings, probabilities: Float64Array): void;
  dispose(): void;
}

/** Radius of a vocabulary point, which is also how far it stands off the floor so it rests on it. */
export const POINT_RADIUS = 0.09;

/** Translucent enough that a ray running under a point still reads, as the nn floor is. */
const FLOOR_OPACITY = 0.55;

/** Lift the rays toward +z, the camera side of the floor, so the plane does not z-fight them. */
const RAY_LIFT = 0.005;

/** The rays sit on the floor, under the spheres; both sort below the wall's own layers. */
const RAY_ORDER = 1;

/** The point every unembedding ray leaves from: the embedding origin, on the floor. */
const ORIGIN = floorFromEmbed([0, 0]);

/**
 * The ray for one word: from the embedding origin through the word's point and on to whichever
 * floor edge it reaches first. This is the direction the tied unembedding scores that word
 * along, so its length carries no meaning and running it to the edge says so.
 *
 * A word sitting exactly on the origin has no direction to point along and draws nothing rather
 * than a degenerate spike — the same rule the column glyphs use for a zero vector.
 */
export function raySegment(e: Vec2): Segment | null {
  const [x, y] = floorFromEmbed(e);
  const dx = x - ORIGIN[0];
  const dy = y - ORIGIN[1];
  if (!(Math.hypot(dx, dy) > 0)) return null;
  // How far along (dx, dy) each pair of edges is; the nearer one is where the ray leaves.
  const tx = dx === 0 ? Infinity : ((dx > 0 ? FLOOR_X[1] : FLOOR_X[0]) - ORIGIN[0]) / dx;
  const ty = dy === 0 ? Infinity : ((dy > 0 ? FLOOR_Y[1] : FLOOR_Y[0]) - ORIGIN[1]) / dy;
  const t = Math.min(tx, ty);
  const from: Vec3 = [ORIGIN[0], ORIGIN[1], RAY_LIFT];
  return [from, [ORIGIN[0] + t * dx, ORIGIN[1] + t * dy, RAY_LIFT]];
}

/** The word the distribution favours. Throws rather than defaulting: a short row is a bug. */
function argmax(probabilities: Float64Array): number {
  if (probabilities.length !== VOCAB.length) {
    throw new Error(`gpt floor: ${probabilities.length} probabilities for ${VOCAB.length} words`);
  }
  let best = 0;
  for (let v = 1; v < probabilities.length; v++) {
    const p = probabilities[v];
    const top = probabilities[best];
    if (p === undefined || top === undefined) throw new Error(`gpt floor: no probability ${v}`);
    if (p > top) best = v;
  }
  return best;
}

/**
 * Embedding space as the floor: a plain `--faint` rectangle with the eight vocabulary words
 * standing on it as draggable spheres, each with the unembedding ray it defines running out to
 * the floor edge. Deliberately not a vertex-coloured field like the nn scene's floor — there is
 * no scalar field here, so the field-versus-points colour clash that scene ran into cannot arise.
 */
export function createFloorEmbed(theme: ThemeColors): FloorEmbed {
  const width = FLOOR_X[1] - FLOOR_X[0];
  const depth = FLOOR_Y[1] - FLOOR_Y[0];
  // PlaneGeometry lies in the XY plane already, which is the floor: no rotation, just a shift
  // onto the floor's centre, since the floor runs in −y from the wall rather than about y = 0.
  const geometry = new PlaneGeometry(width, depth);
  const material = new MeshBasicMaterial({
    transparent: true,
    opacity: FLOOR_OPACITY,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.set((FLOOR_X[0] + FLOOR_X[1]) / 2, (FLOOR_Y[0] + FLOOR_Y[1]) / 2, 0);
  mesh.renderOrder = 0;

  const pointGeometry = new SphereGeometry(POINT_RADIUS, 16, 12);
  const pointMaterial = new MeshStandardMaterial({ roughness: 0.5 });
  const hitTargets = VOCAB.map(() => new Mesh(pointGeometry, pointMaterial));
  const points = new Group();
  points.add(...hitTargets);

  const soft = lineLayer(VOCAB.length * 2, RAY_ORDER, { depth: true });
  const accent = lineLayer(2, RAY_ORDER, { depth: true });
  const rays = { soft, accent } as const;

  const group = new Group();
  group.add(mesh, soft.object, accent.object, points);

  function applyTheme(): void {
    material.color.copy(theme.faint);
    pointMaterial.color.copy(theme.ink);
    // `--soft`, not `--line`, which is near-invisible against the translucent surfaces here.
    soft.material.color.copy(theme.soft);
    accent.material.color.copy(theme.accent);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  return {
    group,
    mesh,
    hitTargets,
    rays,

    set(embeddings, probabilities): void {
      const best = argmax(probabilities);
      const others: Segment[] = [];
      let winner: readonly Segment[] = [];
      for (let v = 0; v < hitTargets.length; v++) {
        const e = embeddings[v];
        const sphere = hitTargets[v];
        if (e === undefined || sphere === undefined) {
          throw new Error(`gpt floor: no embedding for word ${v}`);
        }
        const [x, y] = floorFromEmbed(e);
        // Standing on the floor rather than buried in it, as the nn scene's points do.
        sphere.position.set(x, y, POINT_RADIUS);
        const ray = raySegment(e);
        if (ray === null) continue;
        if (v === best) winner = [ray];
        else others.push(ray);
      }
      // Both writes go through `commit`, so an empty layer hides rather than drawing zero vertices.
      writeWorldSegments(soft, others);
      writeWorldSegments(accent, winner);
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      points.clear();
      geometry.dispose();
      material.dispose();
      pointGeometry.dispose();
      pointMaterial.dispose();
      disposeLayers([soft, accent]);
    },
  };
}
