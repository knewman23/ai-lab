import { describe, expect, it, vi } from "vitest";
import {
  EMBEDDING_PRESETS,
  type Forward,
  forward,
  SEQUENCES,
} from "../../../src/core/math/transformer";
import { floorFromEmbed } from "../../../src/viz/gpt/layout";
import type { Layer, Segment, Vec3 } from "../../../src/viz/shared/layer";
import { createResidualPath, pathPoints, STEP_LABELS } from "../../../src/viz/gpt/residual-path";
import { testTheme } from "./helpers";

function pass(sentence: keyof typeof SEQUENCES): Forward {
  return forward({
    embeddings: EMBEDDING_PRESETS.tuned,
    sequence: SEQUENCES[sentence],
    positional: true,
    causal: true,
  });
}

const CAT_SAT = pass("cat-sat");
const SCRAMBLED = pass("scrambled");
const LAST = SEQUENCES["cat-sat"].length - 1;

function make() {
  const { theme, repaint } = testTheme();
  const path = createResidualPath(theme);
  path.set(CAT_SAT, LAST);
  return { path, theme, repaint };
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

/** An arrow is drawn shaft first, so its first segment is the whole of the arrow's reach. */
function shaft(layer: Layer): Segment {
  const first = drawn(layer)[0];
  if (first === undefined) throw new Error("the layer drew no arrow");
  return first;
}

function length2([a, b]: Segment): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** One 2-vector out of a pass, as the floor point that stands for it. */
function floorAt(f: Forward, rows: readonly Float64Array[], i: number): readonly [number, number] {
  const row = rows[i];
  if (row === undefined) throw new Error(`no vector at ${i}`);
  return floorFromEmbed([row[0]!, row[1]!]);
}

describe("createResidualPath", () => {
  it("chains three arrows through embedding, x, xResid and xFinal", () => {
    const { path } = make();
    const embedding = floorFromEmbed([
      CAT_SAT.x[LAST]![0]! - CAT_SAT.pe[LAST]![0]!,
      CAT_SAT.x[LAST]![1]! - CAT_SAT.pe[LAST]![1]!,
    ]);
    const x = floorAt(CAT_SAT, CAT_SAT.x, LAST);
    const resid = floorAt(CAT_SAT, CAT_SAT.xResid, LAST);
    const final = floorAt(CAT_SAT, CAT_SAT.xFinal, LAST);

    const close = (p: Vec3, q: readonly [number, number]): void => {
      expect(p[0]).toBeCloseTo(q[0], 5);
      expect(p[1]).toBeCloseTo(q[1], 5);
    };
    const position = shaft(path.layers.position);
    close(position[0], embedding);
    close(position[1], x);
    const attention = shaft(path.layers.attention);
    close(attention[0], x);
    close(attention[1], resid);
    const mlp = shaft(path.layers.mlp);
    close(mlp[0], resid);
    close(mlp[1], final);
    path.dispose();
  });

  it("colours the three steps --soft, --accent and --ink, and names them", () => {
    const { path, theme } = make();
    expect(path.layers.position.material.color.equals(theme.soft)).toBe(true);
    expect(path.layers.attention.material.color.equals(theme.accent)).toBe(true);
    expect(path.layers.mlp.material.color.equals(theme.ink)).toBe(true);
    expect(STEP_LABELS).toEqual(["+ position", "+ attention", "+ MLP"]);
    path.dispose();
  });

  it("draws the arrows at true relative length, so the MLP step can be the longer one", () => {
    const { path } = make();
    const ratio = (f: Forward): number => {
      path.set(f, LAST);
      return length2(shaft(path.layers.mlp)) / length2(shaft(path.layers.attention));
    };
    // |mlpOut| / |attnOut| at the last position: 0.46 on `cat-sat`, 1.47 on `scrambled`. A pair
    // normalised to always read long-then-short would report the same number for both.
    expect(ratio(CAT_SAT)).toBeCloseTo(0.46, 2);
    expect(ratio(SCRAMBLED)).toBeCloseTo(1.47, 2);
    path.dispose();
  });

  it("scales the floor arrows by the floor scale, not by a normalisation", () => {
    const { path } = make();
    const attnOut = CAT_SAT.attnOut[LAST]!;
    // The attention step *is* attnOut, drawn 1.4 floor units per embedding unit.
    expect(length2(shaft(path.layers.attention))).toBeCloseTo(
      1.4 * Math.hypot(attnOut[0]!, attnOut[1]!),
      5,
    );
    path.dispose();
  });

  it("marks xFinal with a hollow ring", () => {
    const { path } = make();
    const final = floorAt(CAT_SAT, CAT_SAT.xFinal, LAST);
    const ring = drawn(path.layers.ring);
    expect(ring.length).toBeGreaterThan(8);
    const radii = ring.map(([a]) => Math.hypot(a[0] - final[0], a[1] - final[1]));
    // Every vertex the same distance from the centre, and a visible distance at that: a ring,
    // not a disc and not a dot.
    for (const r of radii) expect(r).toBeCloseTo(0.14, 4);
    // Closed: the last segment returns to where the first began.
    expect(ring.at(-1)![1][0]).toBeCloseTo(ring[0]![0][0], 5);
    expect(ring.at(-1)![1][1]).toBeCloseTo(ring[0]![0][1], 5);
    path.dispose();
  });

  it("gives every arrow a head, and draws nothing at all for a step of zero length", () => {
    const { path } = make();
    // Shaft plus two barbs plus the closing base.
    expect(drawn(path.layers.attention)).toHaveLength(4);
    const flat = forward({
      embeddings: EMBEDDING_PRESETS.tuned,
      sequence: SEQUENCES["cat-sat"],
      positional: false,
      causal: true,
    });
    path.set(flat, LAST);
    // With positional encoding off the embedding *is* x, so the position step has no reach.
    expect(drawn(path.layers.position)).toHaveLength(0);
    expect(path.layers.position.object.visible).toBe(false);
    path.dispose();
  });

  it("lays the whole path on the floor plane z = 0", () => {
    const { path } = make();
    for (const layer of Object.values(path.layers)) {
      for (const [a, b] of drawn(layer)) {
        expect(Math.abs(a[2])).toBeLessThan(0.05);
        expect(Math.abs(b[2])).toBeLessThan(0.05);
      }
    }
    path.dispose();
  });

  it("exposes the four floor points the labels hang off", () => {
    const { path } = make();
    const points = pathPoints(CAT_SAT, LAST);
    expect(points).toHaveLength(4);
    expect(points[1]![0]).toBeCloseTo(shaft(path.layers.position)[1][0], 5);
    expect(points[3]![1]).toBeCloseTo(shaft(path.layers.mlp)[1][1], 5);
    path.dispose();
  });

  it("throws rather than defaulting when the pass has no such position", () => {
    const { path } = make();
    expect(() => path.set(CAT_SAT, 9)).toThrow(/position 9/);
    path.dispose();
  });

  it("hides on setShow(false)", () => {
    const { path } = make();
    expect(path.group.visible).toBe(true);
    path.setShow(false);
    expect(path.group.visible).toBe(false);
    path.setShow(true);
    expect(path.group.visible).toBe(true);
    path.dispose();
  });

  it("recolours on a theme change", () => {
    const { path, theme, repaint } = make();
    repaint("--soft", "#0000ff");
    repaint("--accent", "#ff0000");
    repaint("--ink", "#00ff00");
    expect(path.layers.position.material.color.equals(theme.soft)).toBe(true);
    expect(path.layers.attention.material.color.equals(theme.accent)).toBe(true);
    expect(path.layers.mlp.material.color.equals(theme.ink)).toBe(true);
    expect(path.layers.ring.material.color.equals(theme.ink)).toBe(true);
    path.dispose();
  });

  it("releases its layers and listener on dispose", () => {
    const { path, theme } = make();
    const spies = Object.values(path.layers).flatMap((layer) => [
      vi.spyOn(layer.geometry, "dispose"),
      vi.spyOn(layer.material, "dispose"),
    ]);
    const off = vi.spyOn(theme, "removeEventListener");
    path.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(off).toHaveBeenCalledWith("change", expect.any(Function));
    expect(path.group.children).toHaveLength(0);
  });
});
