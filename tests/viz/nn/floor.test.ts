import type { BufferAttribute, LineSegments, MeshBasicMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import { createThemeColors } from "../../../src/core/theme";
import type { ThemeColors } from "../../../src/viz/types";
import { createFloor } from "../../../src/viz/nn/floor";

const TOKENS: Readonly<Record<string, string>> = {
  "--ink": "#112233",
  "--accent": "#aa2244",
  "--bg": "#f4f2ee",
  "--faint": "#8a8a8a",
  "--line": "#cccccc",
};

/** Samples per axis of the boundary grid; the plane has 39 segments, so 40 vertices a side. */
const N = 40;
const COUNT = N * N;

function make() {
  const theme = createThemeColors((token) => TOKENS[token] ?? "#010203");
  return { floor: createFloor(theme), theme };
}

function uniform(value: number): Float32Array {
  return new Float32Array(COUNT).fill(value);
}

function colours(floor: ReturnType<typeof createFloor>): BufferAttribute {
  return floor.mesh.geometry.getAttribute("color") as BufferAttribute;
}

function expectVertex(attr: BufferAttribute, v: number, colour: ThemeColors["ink"]): void {
  expect(attr.getX(v)).toBeCloseTo(colour.r, 5);
  expect(attr.getY(v)).toBeCloseTo(colour.g, 5);
  expect(attr.getZ(v)).toBeCloseTo(colour.b, 5);
}

describe("createFloor", () => {
  it("paints +1 ink, −1 accent and 0 the background", () => {
    const { floor, theme } = make();
    for (const [value, colour] of [
      [1, theme.ink],
      [-1, theme.accent],
      [0, theme.bg],
    ] as const) {
      floor.set(uniform(value));
      const attr = colours(floor);
      expect(attr.count).toBe(COUNT);
      for (const v of [0, 137, COUNT - 1]) expectVertex(attr, v, colour);
    }
    floor.dispose();
  });

  it("mirrors the grid's rows so the last grid row lands at the largest world y", () => {
    const { floor, theme } = make();
    const grid = new Float32Array(COUNT);
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) grid[ix + N * iy] = iy === N - 1 ? 1 : -1;
    }
    floor.set(grid);

    const position = floor.mesh.geometry.getAttribute("position") as BufferAttribute;
    let maxY = -Infinity;
    let minY = Infinity;
    for (let v = 0; v < COUNT; v++) {
      maxY = Math.max(maxY, position.getY(v));
      minY = Math.min(minY, position.getY(v));
    }
    const attr = colours(floor);
    for (let v = 0; v < COUNT; v++) {
      if (position.getY(v) === maxY) expectVertex(attr, v, theme.ink);
      if (position.getY(v) === minY) expectVertex(attr, v, theme.accent);
    }
    floor.dispose();
  });

  it("setShow(false) fades every vertex to faint, and setShow(true) restores the kept grid", () => {
    const { floor, theme } = make();
    floor.set(uniform(1));
    const material = floor.mesh.material as MeshBasicMaterial;

    floor.setShow(false);
    expect(material.opacity).toBeCloseTo(0.18, 9);
    for (const v of [0, 137, COUNT - 1]) expectVertex(colours(floor), v, theme.faint);

    floor.setShow(true);
    expect(material.opacity).toBeCloseTo(0.55, 9);
    for (const v of [0, 137, COUNT - 1]) expectVertex(colours(floor), v, theme.ink);
    floor.dispose();
  });

  it("setShow does nothing when the toggle has not changed", () => {
    const { floor } = make();
    floor.set(uniform(1));
    const before = colours(floor).version;

    floor.setShow(true);
    // The assembler calls setShow on every state change; an unchanged toggle must not
    // re-lerp and re-upload all 1600 vertex colours.
    expect(colours(floor).version).toBe(before);

    floor.setShow(false);
    expect(colours(floor).version).toBeGreaterThan(before);
    floor.dispose();
  });

  it("rewrites the colours from the kept grid when the theme changes", () => {
    const { floor, theme } = make();
    floor.set(uniform(1));
    theme.ink.setHex(0x123456);
    theme.dispatchEvent(new Event("change"));
    expectVertex(colours(floor), 137, theme.ink);
    floor.dispose();
  });

  it("dispose releases the geometry, the material, the outline and the theme listener", () => {
    const { floor, theme } = make();
    const remove = vi.spyOn(theme, "removeEventListener");
    const outline = floor.group.children.find((c) => c !== floor.mesh) as LineSegments;
    const spies = [
      vi.spyOn(floor.mesh.geometry, "dispose"),
      vi.spyOn(floor.mesh.material as MeshBasicMaterial, "dispose"),
      vi.spyOn(outline.geometry, "dispose"),
      vi.spyOn(outline.material as MeshBasicMaterial, "dispose"),
    ];
    floor.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
