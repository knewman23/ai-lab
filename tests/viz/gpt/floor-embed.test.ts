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
import type { Layer, Segment, Vec3 } from "../../../src/viz/shared/layer";
import { createFloorEmbed } from "../../../src/viz/gpt/floor-embed";
import { testTheme } from "./helpers";

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

/** The segments a layer is actually drawing. */
function drawn(layer: Layer): Segment[] {
  const out: Segment[] = [];
  const point = (at: number): Vec3 => [
    layer.positions[at * 3]!,
    layer.positions[at * 3 + 1]!,
    layer.positions[at * 3 + 2]!,
  ];
  for (let n = 0; n < layer.geometry.drawRange.count; n += 2) out.push([point(n), point(n + 1)]);
  return out;
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
    // Deliberately not a vertex-coloured field: there is no scalar field to paint here.
    expect(material.vertexColors).toBe(false);
    floor.dispose();
  });

  it("puts eight spheres of radius 0.09 at the words' floor points, in --ink", () => {
    const { floor, theme } = make();
    expect(floor.hitTargets).toHaveLength(VOCAB.length);
    for (const sphere of floor.hitTargets) {
      expect((sphere.geometry as SphereGeometry).parameters.radius).toBe(0.09);
      expect((sphere.material as MeshStandardMaterial).color.equals(theme.ink)).toBe(true);
    }
    // Hand-computed: floorFromEmbed((1.4, 0.8)) = (1.4 * 1.4, -3 + 1.4 * 0.8) = (1.96, -1.88).
    const cat = floor.hitTargets[1]!;
    expect(cat.position.x).toBeCloseTo(1.96, 9);
    expect(cat.position.y).toBeCloseTo(-1.88, 9);
    // floorFromEmbed((0, 1.6)) = (0, -0.76).
    const the = floor.hitTargets[0]!;
    expect(the.position.x).toBeCloseTo(0, 9);
    expect(the.position.y).toBeCloseTo(-0.76, 9);
    floor.dispose();
  });

  it("moves the spheres when the embeddings move", () => {
    const { floor } = make();
    const moved = EMBEDDING_PRESETS.tuned.map((e, v) => (v === 3 ? ([2, -2] as const) : e));
    floor.set(moved, PROBS);
    // floorFromEmbed((2, -2)) = (2.8, -5.8): the domain corner, inside the floor with a margin.
    expect(floor.hitTargets[3]!.position.x).toBeCloseTo(2.8, 9);
    expect(floor.hitTargets[3]!.position.y).toBeCloseTo(-5.8, 9);
    floor.dispose();
  });

  it("keeps the hit targets out of the surface the drag raycasts", () => {
    const { floor } = make();
    // `drag.ts` raycasts `surfaceTarget` recursively for click-to-place: an invisible sphere
    // under it would swallow the click. The floor mesh is the surface, and it has no children.
    expect(floor.mesh.children).toHaveLength(0);
    for (const sphere of floor.hitTargets) expect(sphere.parent).not.toBe(floor.mesh);
    floor.dispose();
  });

  it("runs a ray from the origin's floor point through each word out to the floor edge", () => {
    const { floor } = make();
    const rays = [...drawn(floor.rays.soft), ...drawn(floor.rays.accent)];
    expect(rays).toHaveLength(VOCAB.length);
    for (const [from, to] of rays) {
      // floorFromEmbed((0, 0)) = (0, -3).
      expect(from[0]).toBeCloseTo(0, 5);
      expect(from[1]).toBeCloseTo(-3, 5);
      // The far end sits on the floor's boundary, not short of it and not past it.
      const onEdge =
        Math.abs(Math.abs(to[0]) - 3) < 1e-5 || Math.abs(Math.abs(to[1] + 3) - 3) < 1e-5;
      expect(onEdge).toBe(true);
      expect(Math.abs(to[0])).toBeLessThanOrEqual(3 + 1e-5);
      expect(to[1]).toBeGreaterThanOrEqual(-6 - 1e-5);
      expect(to[1]).toBeLessThanOrEqual(1e-5);
    }
    floor.dispose();
  });

  it("points each ray through its word", () => {
    const { floor } = make();
    // "cat" is at (1.96, -1.88): its ray leaves the centre along (1.96, 1.12) and so exits at
    // x = 3, where the parameter is 3 / 1.96 and y is -3 + 1.12 * 3 / 1.96.
    const cat = drawn(floor.rays.soft).find(([, to]) => Math.abs(to[0] - 3) < 1e-5);
    expect(cat).toBeDefined();
    expect(cat![1][1]).toBeCloseTo(-3 + (1.12 * 3) / 1.96, 5);
    floor.dispose();
  });

  it("draws the highest-probability word's ray in --accent and the rest in --soft", () => {
    const { floor, theme } = make();
    let best = 0;
    for (let v = 0; v < PROBS.length; v++) if (PROBS[v]! > PROBS[best]!) best = v;
    expect(best).toBe(0); // "the", at p = 0.79 on `cat-sat` at the tuned preset.

    expect(drawn(floor.rays.accent)).toHaveLength(1);
    expect(drawn(floor.rays.soft)).toHaveLength(VOCAB.length - 1);
    expect(floor.rays.accent.material.color.equals(theme.accent)).toBe(true);
    expect(floor.rays.soft.material.color.equals(theme.soft)).toBe(true);

    // The accent ray must be the winner's: it passes through "the" at (0, -0.76), straight up.
    const [, to] = drawn(floor.rays.accent)[0]!;
    expect(to[0]).toBeCloseTo(0, 5);
    expect(to[1]).toBeCloseTo(0, 5);
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

  it("draws no ray for a word sitting on the origin", () => {
    const { floor } = make();
    const flattened = EMBEDDING_PRESETS.tuned.map((e, v) => (v === 2 ? ([0, 0] as const) : e));
    floor.set(flattened, PROBS);
    // Seven rays, not eight: a word at the origin has no direction to point along.
    expect([...drawn(floor.rays.soft), ...drawn(floor.rays.accent)]).toHaveLength(VOCAB.length - 1);
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
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(off).toHaveBeenCalledWith("change", expect.any(Function));
    expect(floor.group.children).toHaveLength(0);
  });
});
