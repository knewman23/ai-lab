import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
} from "three";
import { type Embeddings, VOCAB } from "../../core/math/transformer";
import { disposeLayers, type Layer, lineLayer, type Segment } from "../shared/layer";
import { writeWorldSegments } from "../shared/layer-write";
import type { ThemeColors } from "../types";
import { FLOOR_CENTRE, FLOOR_SIZE, placements, POINT_RADIUS } from "./floor-embed-geometry";

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

/** Translucent enough that a ray running under a point still reads, as the nn floor is. */
const FLOOR_OPACITY = 0.55;

/** The rays sit on the floor, under the spheres; both sort below the wall's own layers. */
const RAY_ORDER = 1;

/** Endpoints each ray layer can need: two per ray, and only one ray is ever the winner's. */
const SOFT_ENDPOINTS = VOCAB.length * 2;
const ACCENT_ENDPOINTS = 2;

/**
 * Embedding space as the floor: a plain `--faint` rectangle with the eight vocabulary words
 * standing on it as draggable spheres, each with the unembedding ray it defines running out to
 * the floor edge. Deliberately not a vertex-coloured field like the nn scene's floor — there is
 * no scalar field here, so the field-versus-points colour clash that scene ran into cannot arise.
 */
export function createFloorEmbed(theme: ThemeColors): FloorEmbed {
  // PlaneGeometry lies in the XY plane already, which is the floor: no rotation, just a shift
  // onto the floor's centre, since the floor runs in −y from the wall rather than about y = 0.
  const geometry = new PlaneGeometry(FLOOR_SIZE[0], FLOOR_SIZE[1]);
  const material = new MeshBasicMaterial({
    transparent: true,
    opacity: FLOOR_OPACITY,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.set(FLOOR_CENTRE[0], FLOOR_CENTRE[1], 0);
  mesh.renderOrder = 0;

  const pointGeometry = new SphereGeometry(POINT_RADIUS, 16, 12);
  const pointMaterial = new MeshStandardMaterial({ roughness: 0.5 });
  const hitTargets = VOCAB.map(() => new Mesh(pointGeometry, pointMaterial));
  const points = new Group();
  points.add(...hitTargets);

  const soft = lineLayer(SOFT_ENDPOINTS, RAY_ORDER, { depth: true });
  const accent = lineLayer(ACCENT_ENDPOINTS, RAY_ORDER, { depth: true });
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
      const others: Segment[] = [];
      let winner: readonly Segment[] = [];
      const placed = placements(embeddings, probabilities);
      for (let v = 0; v < placed.length; v++) {
        const place = placed[v];
        const sphere = hitTargets[v];
        if (place === undefined || sphere === undefined) {
          throw new Error(`gpt floor: no place for word ${v}`);
        }
        sphere.position.set(place.at[0], place.at[1], place.at[2]);
        if (place.ray === null) continue;
        if (place.winner) winner = [place.ray];
        else others.push(place.ray);
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
