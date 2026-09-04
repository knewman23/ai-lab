import { DoubleSide, MeshStandardMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import { EMBEDDING_PRESETS, forward, SEQUENCES } from "../../../src/core/math/transformer";
import type { Vec3 } from "../../../src/viz/shared/layer";
import {
  ARC_BUFFER_FLOATS,
  ARC_VERTICES,
  arcHalfWidth,
  arcTriangles,
  crossSegments,
} from "../../../src/viz/gpt/arcs-geometry";
import { createArcs } from "../../../src/viz/gpt/arcs";
import { testTheme } from "./helpers";

const SEQUENCE = SEQUENCES["cat-sat"];

function pass(causal: boolean) {
  return forward({
    embeddings: EMBEDDING_PRESETS.tuned,
    sequence: SEQUENCE,
    positional: true,
    causal,
  });
}

const CAUSAL = pass(true);
const OPEN = pass(false);

function make() {
  const { theme, repaint } = testTheme();
  return { arcs: createArcs(theme), theme, repaint };
}

/** The vertices the mesh is actually drawing, as float32 triples. */
function drawn(mesh: { geometry: { drawRange: { count: number } } }, raw: Float32Array): Vec3[] {
  const out: Vec3[] = [];
  for (let n = 0; n < mesh.geometry.drawRange.count; n++) {
    out.push([raw[n * 3]!, raw[n * 3 + 1]!, raw[n * 3 + 2]!]);
  }
  return out;
}

/** The same vertices as float32, so a computed ribbon compares equal to a buffer read. */
function asFloat32(vertices: readonly Vec3[]): Vec3[] {
  return vertices.map((v) => [Math.fround(v[0]), Math.fround(v[1]), Math.fround(v[2])]);
}

/** One row of one head's attention weights, as plain numbers. */
function row(f: typeof CAUSAL, head: 0 | 1, query: number): number[] {
  const h = f.heads[head];
  if (h === undefined) throw new Error(`no head ${head}`);
  const r = h.weights[query];
  if (r === undefined) throw new Error(`no weights row ${query}`);
  return [...r];
}

function scoreRow(f: typeof CAUSAL, head: 0 | 1, query: number): number[] {
  const h = f.heads[head];
  if (h === undefined) throw new Error(`no head ${head}`);
  const r = h.scores[query];
  if (r === undefined) throw new Error(`no scores row ${query}`);
  return [...r];
}

describe("createArcs", () => {
  it("draws nothing until a pass arrives, so the mesh issues no zero-vertex draw", () => {
    const { arcs } = make();
    expect(arcs.mesh.visible).toBe(false);
    expect(arcs.markers.object.visible).toBe(false);
    arcs.dispose();
  });

  it("emits one ribbon per visible key, in key order, sized by the head's weights", () => {
    const { arcs } = make();
    const query = 3;
    arcs.set(CAUSAL, query, "head1");

    const weights = row(CAUSAL, 0, query);
    expect(weights).toHaveLength(query + 1);
    const expected = weights.flatMap((w, j) => arcTriangles(j, query, arcHalfWidth(w)));
    expect(drawn(arcs.mesh, arcs.positions)).toEqual(asFloat32(expected));
    expect(arcs.mesh.geometry.drawRange.count).toBe(weights.length * ARC_VERTICES);
    expect(arcs.mesh.visible).toBe(true);
    arcs.dispose();
  });

  it("reads the second head's own row when head 2 is selected", () => {
    const { arcs } = make();
    arcs.set(CAUSAL, 2, "head2");
    const expected = row(CAUSAL, 1, 2).flatMap((w, j) => arcTriangles(j, 2, arcHalfWidth(w)));
    expect(drawn(arcs.mesh, arcs.positions)).toEqual(asFloat32(expected));
    // The two heads genuinely differ, so the assertion above has something to catch.
    expect(row(CAUSAL, 1, 2)).not.toEqual(row(CAUSAL, 0, 2));
    arcs.dispose();
  });

  it("blends both heads as 0.6 a1 + 0.32 a2, not 0.6 a1 + 0.4 a2", () => {
    const { arcs } = make();
    const query = 4;
    arcs.set(CAUSAL, query, "both");

    const a1 = row(CAUSAL, 0, query);
    const a2 = row(CAUSAL, 1, query);
    const blend = a1.map((w, j) => 0.6 * w + 0.32 * a2[j]!);
    // Head 2's W_V = 0.8 I shrinks its values before W_O mixes them, so the coefficients
    // sum to 0.92: the blend is not a distribution.
    expect(blend.reduce((s, w) => s + w, 0)).toBeCloseTo(0.92, 9);

    const expected = blend.flatMap((w, j) => arcTriangles(j, query, arcHalfWidth(w)));
    expect(drawn(arcs.mesh, arcs.positions)).toEqual(asFloat32(expected));

    const naive = a1.map((w, j) => 0.6 * w + 0.4 * a2[j]!);
    expect(naive.flatMap((w, j) => arcTriangles(j, query, arcHalfWidth(w)))).not.toEqual(expected);
    arcs.dispose();
  });

  it("floats every arc 0.06 in front of the wall, so nothing z-fights with it", () => {
    const { arcs } = make();
    arcs.set(CAUSAL, 4, "both");
    for (const vertex of drawn(arcs.mesh, arcs.positions)) {
      expect(vertex[1]).toBe(Math.fround(-0.06));
    }
    arcs.dispose();
  });

  it("normals every vertex +y and never the reverse, whichever way its arc runs", () => {
    const { arcs } = make();
    arcs.set(CAUSAL, 4, "both");
    const normals = arcs.mesh.geometry.getAttribute("normal");
    // The whole buffer, not only the drawn range: the tail is normalled too.
    expect(normals.array).toHaveLength(ARC_BUFFER_FLOATS);
    for (let n = 0; n < normals.count; n++) {
      // Every triangle is wound the same way, so one normal serves them all. Negating this
      // is what lights the DoubleSide back faces inside out; the geometry never flips it.
      expect([normals.getX(n), normals.getY(n), normals.getZ(n)]).toEqual([0, 1, 0]);
    }
    arcs.dispose();
  });

  it("draws the ribbons double-sided, so a back face is lit rather than culled", () => {
    const { arcs } = make();
    expect(arcs.mesh.material).toBe(arcs.material);
    expect(arcs.material).toBeInstanceOf(MeshStandardMaterial);
    expect(arcs.material.side).toBe(DoubleSide);
    arcs.dispose();
  });

  it("draws every key when the causal mask is off, and only the visible ones when it is on", () => {
    const { arcs } = make();
    arcs.set(OPEN, 1, "head1");
    expect(arcs.mesh.geometry.drawRange.count).toBe(SEQUENCE.length * ARC_VERTICES);
    arcs.set(CAUSAL, 1, "head1");
    expect(arcs.mesh.geometry.drawRange.count).toBe(2 * ARC_VERTICES);
    arcs.dispose();
  });

  it("collapses the unused tail to zero length so a stale arc never reappears", () => {
    const { arcs } = make();
    arcs.set(CAUSAL, 4, "head1");
    arcs.set(CAUSAL, 1, "head1");
    const tail = [...arcs.positions.slice(arcs.mesh.geometry.drawRange.count * 3)];
    expect(tail).toEqual(new Array(tail.length).fill(0));
    expect(tail.length).toBeGreaterThan(0);
    arcs.dispose();
  });

  it("keeps a finite bounding sphere, which a buffer overrun would turn to NaN", () => {
    const { arcs } = make();
    arcs.set(CAUSAL, 4, "both");
    const sphere = arcs.mesh.geometry.boundingSphere;
    if (sphere === null) throw new Error("the arcs have no bounding sphere");
    expect(Number.isFinite(sphere.radius)).toBe(true);
    arcs.dispose();
  });
});

describe("createArcs focus", () => {
  it("switches to the min-max normalised raw score under the scores focus", () => {
    const { arcs } = make();
    const query = 3;
    arcs.set(CAUSAL, query, "head1");
    arcs.setFocus("scores");

    const scores = scoreRow(CAUSAL, 0, query);
    const lo = Math.min(...scores);
    const hi = Math.max(...scores);
    expect(hi).toBeGreaterThan(lo);
    const expected = scores.flatMap((s, j) =>
      arcTriangles(j, query, arcHalfWidth((s - lo) / (hi - lo))),
    );
    expect(drawn(arcs.mesh, arcs.positions)).toEqual(asFloat32(expected));
    // The scores are not the weights, so this is a real switch rather than the same picture.
    expect(expected).not.toEqual(
      scores.flatMap((_, j) => arcTriangles(j, query, arcHalfWidth(row(CAUSAL, 0, query)[j]!))),
    );
    arcs.dispose();
  });

  it("marks each masked key with a cross under the scores focus", () => {
    const { arcs } = make();
    arcs.set(CAUSAL, 1, "head1");
    arcs.setFocus("scores");

    const expectedSegments = [2, 3, 4].flatMap((j) => crossSegments(j));
    const positions = arcs.markers.positions;
    const drawnPoints: Vec3[] = [];
    for (let n = 0; n < arcs.markers.geometry.drawRange.count; n++) {
      drawnPoints.push([positions[n * 3]!, positions[n * 3 + 1]!, positions[n * 3 + 2]!]);
    }
    expect(drawnPoints).toEqual(asFloat32(expectedSegments.flatMap((s) => [...s])));
    expect(arcs.markers.object.visible).toBe(true);
    arcs.dispose();
  });

  it("shows no crosses for the last query, which masks nothing", () => {
    const { arcs } = make();
    arcs.set(CAUSAL, SEQUENCE.length - 1, "head1");
    arcs.setFocus("scores");
    expect(arcs.markers.object.visible).toBe(false);
    arcs.dispose();
  });

  it("shows no crosses when the causal mask is off, because nothing is masked", () => {
    const { arcs } = make();
    arcs.set(OPEN, 1, "head1");
    arcs.setFocus("scores");
    expect(arcs.markers.object.visible).toBe(false);
    arcs.dispose();
  });

  it("hides the crosses and returns to the weights when the focus leaves scores", () => {
    const { arcs } = make();
    arcs.set(CAUSAL, 1, "head1");
    arcs.setFocus("scores");
    arcs.setFocus("softmax");
    expect(arcs.markers.object.visible).toBe(false);
    const expected = row(CAUSAL, 0, 1).flatMap((w, j) => arcTriangles(j, 1, arcHalfWidth(w)));
    expect(drawn(arcs.mesh, arcs.positions)).toEqual(asFloat32(expected));
    arcs.dispose();
  });

  it("keeps the focus when a new pass arrives", () => {
    const { arcs } = make();
    arcs.setFocus("scores");
    arcs.set(CAUSAL, 1, "head1");
    expect(arcs.markers.object.visible).toBe(true);
    arcs.dispose();
  });

  it("gives a lone key full width, where the score range has collapsed to a point", () => {
    const { arcs } = make();
    arcs.set(CAUSAL, 0, "head1");
    arcs.setFocus("scores");
    expect(drawn(arcs.mesh, arcs.positions)).toEqual(
      asFloat32(arcTriangles(0, 0, arcHalfWidth(1))),
    );
    arcs.dispose();
  });
});

describe("createArcs theme", () => {
  it("draws the ribbons in --accent and recolours on a theme change", () => {
    const { arcs, theme, repaint } = make();
    expect(arcs.material.color.getHex()).toBe(theme.accent.getHex());
    expect(arcs.markers.material.color.getHex()).toBe(theme.soft.getHex());
    repaint("--accent", "#123456");
    expect(arcs.material.color.getHex()).toBe(theme.accent.getHex());
    expect(arcs.material.color.getHex()).toBe(0x123456);
    arcs.dispose();
  });

  it("releases its geometry and material and stops listening on dispose", () => {
    const { arcs, repaint } = make();
    const geometry = vi.spyOn(arcs.mesh.geometry, "dispose");
    const material = vi.spyOn(arcs.material, "dispose");
    const markers = vi.spyOn(arcs.markers.geometry, "dispose");
    const before = arcs.material.color.getHex();

    arcs.dispose();
    expect(geometry).toHaveBeenCalledOnce();
    expect(material).toHaveBeenCalledOnce();
    expect(markers).toHaveBeenCalledOnce();
    expect(arcs.group.children).toHaveLength(0);
    repaint("--accent", "#0a0b0c");
    expect(arcs.material.color.getHex()).toBe(before);
  });
});
