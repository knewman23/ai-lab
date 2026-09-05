import {
  Box3,
  type Mesh,
  MeshBasicMaterial,
  type MeshStandardMaterial,
  SphereGeometry,
} from "three";
import { describe, expect, it, vi } from "vitest";
import {
  EMBEDDING_PRESETS,
  forward,
  probabilities,
  SEQUENCES,
  VOCAB,
} from "../../../src/core/math/transformer";
import { placements, POINT_RADIUS } from "../../../src/viz/gpt/floor-embed-geometry";
import type { Layer, Segment } from "../../../src/viz/shared/layer";
import { createFloorEmbed } from "../../../src/viz/gpt/floor-embed";
import { drawn, testTheme } from "./helpers";

const PASS = forward({
  embeddings: EMBEDDING_PRESETS.tuned,
  sequence: SEQUENCES["cat-sat"],
  positional: true,
  causal: true,
});
const PROBS = probabilities(PASS.logits, 1);

function make() {
  const { theme, repaint } = testTheme();
  const floor = createFloorEmbed(theme);
  floor.set(EMBEDDING_PRESETS.tuned, PROBS);
  return { floor, theme, repaint };
}

/** The world-space bounding box of a mesh's geometry, with its transform applied. */
function worldBox(mesh: Mesh): Box3 {
  mesh.updateMatrixWorld(true);
  const world = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  const box = new Box3().setFromBufferAttribute(world.getAttribute("position") as never);
  world.dispose();
  return box;
}

describe("createFloorEmbed", () => {
  it("is a plain rectangle spanning x [-3, 3] and y [-6, 0] in the plane z = 0", () => {
    const { floor, theme } = make();
    const box = worldBox(floor.mesh);
    expect(box.min.x).toBeCloseTo(-3, 6);
    expect(box.max.x).toBeCloseTo(3, 6);
    expect(box.min.y).toBeCloseTo(-6, 6);
    expect(box.max.y).toBeCloseTo(0, 6);
    expect(box.min.z).toBeCloseTo(0, 6);
    expect(box.max.z).toBeCloseTo(0, 6);
    const material = floor.mesh.material as MeshBasicMaterial;
    expect(material.color.equals(theme.faint)).toBe(true);
    // Deliberately not a vertex-coloured field: there is no scalar field to paint here, so the
    // nn scene's field-versus-points colour clash does not arise.
    expect(material.vertexColors).toBe(false);
    floor.dispose();
  });

  it("puts a sphere of radius 0.09 at each word's place, in --ink", () => {
    const { floor, theme } = make();
    expect(floor.hitTargets).toHaveLength(VOCAB.length);
    const placed = placements(EMBEDDING_PRESETS.tuned, PROBS);
    for (let v = 0; v < floor.hitTargets.length; v++) {
      const sphere = floor.hitTargets[v]!;
      expect((sphere.geometry as SphereGeometry).parameters.radius).toBe(0.09);
      expect((sphere.material as MeshStandardMaterial).color.equals(theme.ink)).toBe(true);
      expect(sphere.position.toArray()).toEqual([...placed[v]!.at]);
    }
    floor.dispose();
  });

  it("moves the spheres when the embeddings move", () => {
    const { floor } = make();
    const moved = EMBEDDING_PRESETS.tuned.map((e, v) => (v === 3 ? ([2, -2] as const) : e));
    floor.set(moved, PROBS);
    // floorFromEmbed((2, -2)) = (2.8, -5.8): the domain corner, inside the floor with a margin.
    expect(floor.hitTargets[3]!.position.x).toBeCloseTo(2.8, 9);
    expect(floor.hitTargets[3]!.position.y).toBeCloseTo(-5.8, 9);
    expect(floor.hitTargets[3]!.position.z).toBe(POINT_RADIUS);
    floor.dispose();
  });

  it("keeps the hit targets out of the surface the drag raycasts", () => {
    const { floor } = make();
    // `drag.ts` raycasts `surfaceTarget` recursively for click-to-place: an invisible mesh under
    // it would swallow the click. The floor mesh is the surface, and it has no children.
    expect(floor.mesh.children).toHaveLength(0);
    for (const sphere of floor.hitTargets) expect(sphere.parent).not.toBe(floor.mesh);
    // They are still in the scene, under a group of their own.
    expect(floor.hitTargets.every((sphere) => sphere.parent !== null)).toBe(true);
    floor.dispose();
  });

  it("draws exactly the rays the geometry computes, winner apart", () => {
    const { floor } = make();
    const placed = placements(EMBEDDING_PRESETS.tuned, PROBS);
    const expected = (winner: boolean): Segment[] =>
      placed.filter((p) => p.winner === winner && p.ray !== null).map((p) => p.ray!);

    const check = (layer: Layer, want: Segment[]): void => {
      const got = drawn(layer);
      expect(got).toHaveLength(want.length);
      for (let i = 0; i < want.length; i++) {
        for (const end of [0, 1] as const) {
          for (let j = 0; j < 3; j++) expect(got[i]![end][j]).toBeCloseTo(want[i]![end][j]!, 5);
        }
      }
    };
    check(floor.rays.accent, expected(true));
    check(floor.rays.soft, expected(false));
    expect(drawn(floor.rays.accent)).toHaveLength(1);
    expect(drawn(floor.rays.soft)).toHaveLength(VOCAB.length - 1);
    floor.dispose();
  });

  it("follows the winner when the distribution moves", () => {
    const { floor } = make();
    const skewed = Float64Array.from(PROBS.map((_, v) => (v === 4 ? 1 : 0)));
    floor.set(EMBEDDING_PRESETS.tuned, skewed);
    // "mat" is at floorFromEmbed((1.2, -1)) = (1.68, -4.4): its ray leaves through the -y half.
    const [, to] = drawn(floor.rays.accent)[0]!;
    expect(to[1]).toBeLessThan(-3);
    expect(to[0]).toBeGreaterThan(0);
    floor.dispose();
  });

  it("hides a layer with no rays in it rather than drawing zero vertices", () => {
    const { floor } = make();
    const flattened = EMBEDDING_PRESETS.tuned.map(() => [0, 0] as const);
    floor.set(flattened, PROBS);
    // Every word on the origin: no ray has a direction, so both layers empty and both hide.
    expect(drawn(floor.rays.soft)).toHaveLength(0);
    expect(floor.rays.soft.object.visible).toBe(false);
    expect(floor.rays.accent.object.visible).toBe(false);
    floor.dispose();
  });

  it("colours the winner's ray --accent and the rest --soft", () => {
    const { floor, theme } = make();
    expect(floor.rays.accent.material.color.equals(theme.accent)).toBe(true);
    // `--soft`, never `--line`, which is near-invisible against the translucent surfaces here.
    expect(floor.rays.soft.material.color.equals(theme.soft)).toBe(true);
    floor.dispose();
  });

  it("recolours on a theme change", () => {
    const { floor, theme, repaint } = make();
    repaint("--ink", "#00ff00");
    repaint("--soft", "#0000ff");
    repaint("--accent", "#ff0000");
    repaint("--faint", "#123456");
    expect((floor.hitTargets[0]!.material as MeshStandardMaterial).color.equals(theme.ink)).toBe(
      true,
    );
    expect(floor.rays.soft.material.color.equals(theme.soft)).toBe(true);
    expect(floor.rays.accent.material.color.equals(theme.accent)).toBe(true);
    expect((floor.mesh.material as MeshBasicMaterial).color.equals(theme.faint)).toBe(true);
    floor.dispose();
  });

  it("releases its geometries, materials and listener on dispose", () => {
    const { floor, theme } = make();
    const sphere = floor.hitTargets[0]!;
    const spies = [
      vi.spyOn(floor.mesh.geometry, "dispose"),
      vi.spyOn(floor.mesh.material as MeshBasicMaterial, "dispose"),
      vi.spyOn(sphere.geometry, "dispose"),
      vi.spyOn(sphere.material as MeshStandardMaterial, "dispose"),
      vi.spyOn(floor.rays.soft.geometry, "dispose"),
      vi.spyOn(floor.rays.soft.material, "dispose"),
      vi.spyOn(floor.rays.accent.geometry, "dispose"),
      vi.spyOn(floor.rays.accent.material, "dispose"),
    ];
    const off = vi.spyOn(theme, "removeEventListener");
    floor.dispose();
    // One shared geometry and material across the eight spheres, so each disposes once.
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(off).toHaveBeenCalledWith("change", expect.any(Function));
    expect(floor.group.children).toHaveLength(0);
  });
});
