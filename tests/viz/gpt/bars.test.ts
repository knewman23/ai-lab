import { DoubleSide, type MeshStandardMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  EMBEDDING_PRESETS,
  forward,
  probabilities,
  SEQUENCES,
  VOCAB,
} from "../../../src/core/math/transformer";
import { COLUMN_X, WALL_H, WALL_W } from "../../../src/viz/gpt/layout";
import type { Layer, Segment, Vec3 } from "../../../src/viz/shared/layer";
import { barX, createBars } from "../../../src/viz/gpt/bars";
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
  const bars = createBars(theme);
  bars.set(PROBS);
  return { bars, theme, repaint };
}

interface Extent {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** The x and z extent of the quad drawn for word `v`. */
function extent(positions: Float32Array, v: number, verticesPerBar: number): Extent {
  const xs: number[] = [];
  const zs: number[] = [];
  for (let n = v * verticesPerBar; n < (v + 1) * verticesPerBar; n++) {
    xs.push(positions[n * 3]!);
    zs.push(positions[n * 3 + 2]!);
  }
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function extents(bars: ReturnType<typeof createBars>): Extent[] {
  const per = bars.geometry.drawRange.count / VOCAB.length;
  return VOCAB.map((_, v) => extent(bars.positions, v, per));
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

describe("createBars", () => {
  it("draws one bar per vocabulary word, in vocabulary order", () => {
    const { bars } = make();
    const boxes = extents(bars);
    expect(boxes).toHaveLength(VOCAB.length);
    for (let v = 1; v < boxes.length; v++) {
      expect(boxes[v]!.minX).toBeGreaterThan(boxes[v - 1]!.maxX);
    }
    // `barX` names the same centres the buffer holds, so the labels land on their bars.
    for (let v = 0; v < boxes.length; v++) {
      expect((boxes[v]!.minX + boxes[v]!.maxX) / 2).toBeCloseTo(barX(v), 5);
    }
    expect(() => barX(VOCAB.length)).toThrow(/bar/);
    bars.dispose();
  });

  it("makes every bar 0.28 wide, evenly pitched, and keeps the row inside the wall", () => {
    const { bars } = make();
    const boxes = extents(bars);
    for (const box of boxes) expect(box.maxX - box.minX).toBeCloseTo(0.28, 5);
    const pitch = barX(1) - barX(0);
    for (let v = 1; v < boxes.length; v++) expect(barX(v) - barX(v - 1)).toBeCloseTo(pitch, 5);
    // A gap between neighbours, and clear of both wall edges.
    expect(pitch).toBeGreaterThan(0.28);
    expect(boxes[0]!.minX).toBeGreaterThan(-WALL_W / 2);
    expect(boxes.at(-1)!.maxX).toBeLessThan(WALL_W / 2);
    bars.dispose();
  });

  it("stands the bars on the logits band with the tallest filling it", () => {
    const { bars } = make();
    const boxes = extents(bars);
    for (const box of boxes) expect(box.minZ).toBeCloseTo(4.2, 5);
    const heights = boxes.map((box) => box.maxZ - box.minZ);
    // 0.55 * p / max(p): the tallest always fills the band, whatever the distribution.
    expect(Math.max(...heights)).toBeCloseTo(0.55, 5);
    expect(Math.max(...boxes.map((box) => box.maxZ))).toBeCloseTo(4.75, 5);
    expect(4.75).toBeLessThan(WALL_H);
    bars.dispose();
  });

  it("takes each height from the probability relative to the largest", () => {
    const { bars } = make();
    const max = Math.max(...PROBS);
    const heights = extents(bars).map((box) => box.maxZ - box.minZ);
    for (let v = 0; v < heights.length; v++) {
      expect(heights[v]!).toBeCloseTo((0.55 * PROBS[v]!) / max, 5);
    }
    // On `cat-sat` at the tuned preset "the" wins at p = 0.79 and "cat" trails at 0.041.
    expect(heights[0]!).toBeCloseTo(0.55, 5);
    expect(heights[1]!).toBeCloseTo(0.0289, 3);
    bars.dispose();
  });

  it("rescales when the distribution flattens", () => {
    const { bars } = make();
    const uniform = Float64Array.from(VOCAB.map(() => 1 / VOCAB.length));
    bars.set(uniform);
    for (const box of extents(bars)) expect(box.maxZ - box.minZ).toBeCloseTo(0.55, 5);
    bars.dispose();
  });

  it("throws rather than defaulting on a distribution of the wrong size or no mass", () => {
    const { bars } = make();
    expect(() => bars.set(Float64Array.from([1, 0]))).toThrow(/bars/);
    expect(() => bars.set(Float64Array.from(VOCAB.map(() => 0)))).toThrow(/mass/);
    bars.dispose();
  });

  it("runs a --soft leader line up from the top of the last token's column", () => {
    const { bars, theme } = make();
    const leader = drawn(bars.leader);
    expect(leader).toHaveLength(1);
    const [from, to] = leader[0]!;
    expect(from[0]).toBeCloseTo(COLUMN_X[4], 5);
    expect(to[0]).toBeCloseTo(COLUMN_X[4], 5);
    // From the top of the column stem at the MLP band up to the logits band the bars stand on.
    expect(from[2]).toBeCloseTo(3.4, 5);
    expect(to[2]).toBeCloseTo(4.2, 5);
    expect(bars.leader.material.color.equals(theme.soft)).toBe(true);
    bars.dispose();
  });

  it("draws the bars in --accent, double-sided, in front of the wall", () => {
    const { bars, theme } = make();
    expect(bars.material.color.equals(theme.accent)).toBe(true);
    expect(bars.material.side).toBe(DoubleSide);
    for (let n = 0; n < bars.geometry.drawRange.count; n++) {
      expect(bars.positions[n * 3 + 1]!).toBeLessThan(0);
    }
    // One normal for the whole buffer, never negated: WebGPU's DoubleSide path already
    // multiplies by faceDirection.
    const normals = bars.geometry.getAttribute("normal");
    for (let n = 0; n < normals.count; n++) expect(normals.getY(n)).toBe(1);
    bars.dispose();
  });

  it("draws nothing until it has a distribution", () => {
    const { theme } = testTheme();
    const bars = createBars(theme);
    // WebGPU warns on a draw with zero vertices, so the row is hidden until the first `set`.
    expect(bars.mesh.visible).toBe(false);
    bars.set(PROBS);
    expect(bars.mesh.visible).toBe(true);
    bars.dispose();
  });

  it("recolours on a theme change", () => {
    const { bars, theme, repaint } = make();
    repaint("--accent", "#ff0000");
    repaint("--soft", "#0000ff");
    expect((bars.mesh.material as MeshStandardMaterial).color.equals(theme.accent)).toBe(true);
    expect(bars.leader.material.color.equals(theme.soft)).toBe(true);
    bars.dispose();
  });

  it("releases its geometry, material and listener on dispose", () => {
    const { bars, theme } = make();
    const spies = [
      vi.spyOn(bars.geometry, "dispose"),
      vi.spyOn(bars.material, "dispose"),
      vi.spyOn(bars.leader.geometry, "dispose"),
      vi.spyOn(bars.leader.material, "dispose"),
    ];
    const off = vi.spyOn(theme, "removeEventListener");
    bars.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(off).toHaveBeenCalledWith("change", expect.any(Function));
    expect(bars.group.children).toHaveLength(0);
  });
});
