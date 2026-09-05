import { DoubleSide, type MeshStandardMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  EMBEDDING_PRESETS,
  forward,
  probabilities,
  SEQUENCES,
  VOCAB,
} from "../../../src/core/math/transformer";
import { BAR_BUFFER_FLOATS, leaderSegment, writeBars } from "../../../src/viz/gpt/bars-geometry";
import type { Layer, Segment, Vec3 } from "../../../src/viz/shared/layer";
import { createBars } from "../../../src/viz/gpt/bars";
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
  it("draws exactly what the geometry computes for the distribution", () => {
    const { bars } = make();
    const expected = new Float32Array(BAR_BUFFER_FLOATS);
    const count = writeBars(expected, PROBS);
    expect(bars.geometry.drawRange.count).toBe(count);
    expect([...bars.positions]).toEqual([...expected]);
    bars.dispose();
  });

  it("rewrites the buffer on a new distribution rather than rebuilding geometry", () => {
    const { bars } = make();
    const before = bars.geometry;
    const uniform = Float64Array.from(VOCAB.map(() => 1 / VOCAB.length));
    bars.set(uniform);
    const expected = new Float32Array(BAR_BUFFER_FLOATS);
    writeBars(expected, uniform);
    expect(bars.geometry).toBe(before);
    expect([...bars.positions]).toEqual([...expected]);
    bars.dispose();
  });

  it("lets the geometry's guards through rather than drawing a broken row", () => {
    const { bars } = make();
    expect(() => bars.set(Float64Array.from([1, 0]))).toThrow(/probabilities for 8 words/);
    expect(() => bars.set(Float64Array.from(VOCAB.map(() => 0)))).toThrow(/no mass/);
    bars.dispose();
  });

  it("runs the leader line the geometry names, in --soft", () => {
    const { bars, theme } = make();
    expect(drawn(bars.leader)).toHaveLength(1);
    const [from, to] = drawn(bars.leader)[0]!;
    const [expectedFrom, expectedTo] = leaderSegment();
    for (let i = 0; i < 3; i++) {
      expect(from[i]).toBeCloseTo(expectedFrom[i]!, 5);
      expect(to[i]).toBeCloseTo(expectedTo[i]!, 5);
    }
    // `--soft`, never `--line`, which is near-invisible against the translucent wall.
    expect(bars.leader.material.color.equals(theme.soft)).toBe(true);
    bars.dispose();
  });

  it("draws the bars in --accent, double-sided, on one un-negated normal", () => {
    const { bars, theme } = make();
    expect(bars.material.color.equals(theme.accent)).toBe(true);
    expect(bars.material.side).toBe(DoubleSide);
    // One normal for the whole buffer, never negated: WebGPU's DoubleSide path already
    // multiplies by faceDirection.
    const normals = bars.geometry.getAttribute("normal");
    expect(normals.count * 3).toBe(BAR_BUFFER_FLOATS);
    for (let n = 0; n < normals.count; n++) {
      expect([normals.getX(n), normals.getY(n), normals.getZ(n)]).toEqual([0, 1, 0]);
    }
    bars.dispose();
  });

  it("draws nothing until it has a distribution", () => {
    const { theme } = testTheme();
    const bars = createBars(theme);
    // WebGPU warns on a draw with zero vertices, so the row is hidden until the first `set`.
    expect(bars.geometry.drawRange.count).toBe(0);
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
