import { describe, expect, it } from "vitest";
import { FACES, lineLayer } from "../../../src/viz/shared/layer";
import {
  writeClippedPolyline,
  writePoints,
  writeWorldSegments,
} from "../../../src/viz/shared/layer-write";

/** The live vertices of a layer as [x, y, z] triples. */
function drawn(layer: ReturnType<typeof lineLayer>): number[][] {
  const { count } = layer.geometry.drawRange;
  const out: number[][] = [];
  for (let i = 0; i < count; i++) {
    out.push([layer.positions[i * 3]!, layer.positions[i * 3 + 1]!, layer.positions[i * 3 + 2]!]);
  }
  return out;
}

function expectVertices(actual: number[][], expected: number[][]): void {
  expect(actual.length).toBe(expected.length);
  actual.forEach((v, i) => {
    v.forEach((c, k) => expect(c).toBeCloseTo(expected[i]![k]!, 5));
  });
}

describe("lineLayer without options", () => {
  it("keeps the flat derivative behaviour: world (a, 0, b), no lift, no depth test", () => {
    const layer = lineLayer(4, 2);
    writePoints(layer, [
      [0, 0],
      [1, 1],
    ]);
    expectVertices(drawn(layer), [
      [0, 0, 0],
      [1, 0, 1],
    ]);
    expect(layer.material.depthTest).toBe(false);
    expect(layer.material.depthWrite).toBe(false);
    expect(layer.material.transparent).toBe(true);
    expect(layer.object.renderOrder).toBe(2);
  });
});

describe("lineLayer on a face", () => {
  it("places centred face-local points on the side wall", () => {
    const layer = lineLayer(4, 2, { face: FACES.side });
    writePoints(layer, [
      [0, 0],
      [1, 1],
    ]);
    expectVertices(drawn(layer), [
      [-3 + 0.01, 3, 3],
      [-3 + 0.01, 4, 4],
    ]);
  });

  it("places centred face-local points on the front wall", () => {
    const layer = lineLayer(4, 2, { face: FACES.front });
    writePoints(layer, [
      [0, 0],
      [1, 1],
    ]);
    expectVertices(drawn(layer), [
      [0, 0.01, 3],
      [1, 0.01, 4],
    ]);
  });

  it("places centred face-local points on the floor", () => {
    const layer = lineLayer(4, 2, { face: FACES.floor });
    writePoints(layer, [
      [0, 0],
      [1, 1],
    ]);
    expectVertices(drawn(layer), [
      [0, 3, 0.01],
      [1, 4, 0.01],
    ]);
  });

  it("depth-tests against the box without writing depth", () => {
    const layer = lineLayer(4, 7, { face: FACES.front });
    expect(layer.material.depthTest).toBe(true);
    expect(layer.material.depthWrite).toBe(false);
    expect(layer.material.transparent).toBe(true);
    expect(layer.object.renderOrder).toBe(7);
  });

  it("clips a polyline about the face centre, in face-local coordinates", () => {
    const layer = lineLayer(8, 1, { face: FACES.front });
    writeClippedPolyline(layer, new Float32Array([0, 0]), new Float32Array([0, 7]), [3, 3]);
    expectVertices(drawn(layer), [
      [0, 0.01, 3],
      [0, 0.01, 6],
    ]);
  });

  it("skips the segments touching a NaN sample and keeps their neighbours", () => {
    const layer = lineLayer(16, 1, { face: FACES.front });
    const A = new Float32Array([-2, -1, 0, 1, 2]);
    const B = new Float32Array([0, 0, NaN, 0, 0]);
    writeClippedPolyline(layer, A, B, [3, 3]);
    expectVertices(drawn(layer), [
      [-2, 0.01, 3],
      [-1, 0.01, 3],
      [1, 0.01, 3],
      [2, 0.01, 3],
    ]);
  });
});

describe("lineLayer with depth", () => {
  it("copies world segments verbatim and depth-tests them", () => {
    const layer = lineLayer(4, 3, { depth: true });
    writeWorldSegments(layer, [
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
      [
        [-1, 0, 0.5],
        [0, 0, 0],
      ],
    ]);
    expect(layer.geometry.drawRange.count).toBe(4);
    expect(Array.from(layer.positions)).toEqual([1, 2, 3, 4, 5, 6, -1, 0, 0.5, 0, 0, 0]);
    expect(layer.material.depthTest).toBe(true);
    expect(layer.material.depthWrite).toBe(false);
    expect(layer.material.transparent).toBe(true);
    expect(layer.object.renderOrder).toBe(3);
  });
});
