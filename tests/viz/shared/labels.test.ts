// @vitest-environment jsdom
import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { createLabelLayer, projectToPixels } from "../../../src/viz/shared/labels";

/** A Z-up camera 10 units in front of the origin (−y), looking at it. */
function camera(): PerspectiveCamera {
  const cam = new PerspectiveCamera(45, 1, 0.1, 100);
  cam.up.set(0, 0, 1);
  cam.position.set(0, -10, 0);
  cam.lookAt(0, 0, 0);
  return cam;
}

/** Pixel offsets from a span's transform: `translate(-50%, -100%) translate(100px, 100px)`. */
function pixels(span: Element): readonly [number, number] {
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec((span as HTMLElement).style.transform);
  if (m?.[1] === undefined || m[2] === undefined) throw new Error("no pixel translate");
  return [Number(m[1]), Number(m[2])];
}

describe("projectToPixels", () => {
  it("maps the origin to the canvas centre", () => {
    const cam = camera();
    cam.updateMatrixWorld();
    const p = projectToPixels([0, 0, 0], cam, 200, 200);
    expect(p?.[0]).toBeCloseTo(100);
    expect(p?.[1]).toBeCloseTo(100);
  });

  it("maps +x to the right of centre on the same row", () => {
    const cam = camera();
    cam.updateMatrixWorld();
    const p = projectToPixels([1, 0, 0], cam, 200, 200);
    expect(p).not.toBeNull();
    expect(p?.[0]).toBeGreaterThan(100);
    expect(p?.[1]).toBeCloseTo(100);
  });

  it("returns null behind the camera and outside the canvas", () => {
    const cam = camera();
    cam.updateMatrixWorld();
    expect(projectToPixels([0, -20, 0], cam, 200, 200)).toBeNull();
    expect(projectToPixels([30, 0, 0], cam, 200, 200)).toBeNull();
  });
});

describe("createLabelLayer", () => {
  it("appends one overlay div without disturbing the host's children", () => {
    const host = document.createElement("div");
    const canvas = document.createElement("canvas");
    host.append(canvas);
    const layer = createLabelLayer(host);

    expect(host.children).toHaveLength(2);
    expect(host.firstElementChild).toBe(canvas);
    expect(host.querySelectorAll("div.viz-labels")).toHaveLength(1);

    layer.dispose();
    expect(host.querySelector("div.viz-labels")).toBeNull();
    expect(host.children).toHaveLength(1);
  });

  it("creates a span per id, updates it in place, and removes it", () => {
    const host = document.createElement("div");
    const layer = createLabelLayer(host);

    layer.set("a", "x1", [0, 0, 0], "node");
    const span = host.querySelector("span.node");
    expect(span?.textContent).toBe("x1");

    layer.set("a", "x2", [1, 0, 0], "node");
    expect(host.querySelectorAll("span")).toHaveLength(1);
    expect(host.querySelector("span.node")).toBe(span);
    expect(span?.textContent).toBe("x2");

    layer.remove("a");
    expect(host.querySelectorAll("span")).toHaveLength(0);
    layer.dispose();
  });

  it("anchors op labels on the point and other kinds above it", () => {
    const host = document.createElement("div");
    const layer = createLabelLayer(host);
    layer.set("op", "+", [0, 0, 0], "op");
    layer.set("val", "2", [0, 0, 0], "value");
    layer.update(camera(), 200, 200);

    const op = host.querySelector<HTMLElement>("span.op");
    const val = host.querySelector<HTMLElement>("span.value");
    expect(op?.style.transform).toBe("translate(-50%, -50%) translate(100px, 100px)");
    expect(val?.style.transform).toBe("translate(-50%, -100%) translate(100px, 100px)");

    layer.set("op", "+", [0, 0, 0], "node");
    layer.update(camera(), 200, 200);
    expect(op?.style.transform).toBe("translate(-50%, -100%) translate(100px, 100px)");
    layer.dispose();
  });

  it("projects to pixels, hiding points behind the camera or off the canvas", () => {
    const host = document.createElement("div");
    const layer = createLabelLayer(host);
    layer.set("o", "o", [0, 0, 0], "node");
    layer.set("behind", "b", [0, -20, 0], "node");
    layer.set("off", "f", [30, 0, 0], "node");
    layer.update(camera(), 200, 200);

    const spans = host.querySelectorAll<HTMLElement>("span");
    expect(pixels(spans[0] as Element)).toEqual([100, 100]);
    expect(spans[0]?.hidden).toBe(false);
    expect(spans[1]?.hidden).toBe(true);
    expect(spans[2]?.hidden).toBe(true);

    layer.set("behind", "b", [0, 0, 0], "node");
    layer.update(camera(), 200, 200);
    expect(spans[1]?.hidden).toBe(false);
    layer.dispose();
  });

  it("does nothing when the canvas has no size", () => {
    const host = document.createElement("div");
    const layer = createLabelLayer(host);
    layer.set("o", "o", [0, 0, 0], "node");
    layer.update(camera(), 0, 200);
    layer.update(camera(), 200, 0);

    const span = host.querySelector<HTMLElement>("span");
    expect(span?.style.transform).toBe("");
    expect(span?.hidden).toBe(false);
    layer.dispose();
  });

  it("clears every span but keeps the overlay", () => {
    const host = document.createElement("div");
    const layer = createLabelLayer(host);
    layer.set("a", "a", [0, 0, 0], "node");
    layer.set("b", "b", [0, 0, 0], "grad");
    layer.clear();

    expect(host.querySelectorAll("span")).toHaveLength(0);
    expect(host.querySelector("div.viz-labels")).not.toBeNull();

    layer.set("a", "a", [0, 0, 0], "node");
    expect(host.querySelectorAll("span")).toHaveLength(1);
    layer.dispose();
  });
});
