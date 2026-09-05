// @vitest-environment jsdom
import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../../src/viz/shared/layer";
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

/**
 * jsdom measures every element as 0 x 0, so the test says how wide each label draws. The layer
 * measures a span once and caches it, so this must run before the update that places them.
 */
function drawAt(host: HTMLElement, w: number, h: number): void {
  for (const span of host.querySelectorAll("span")) {
    span.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, w, h);
  }
}

describe("createLabelLayer with a rank function", () => {
  it("hides the worse-ranked of two labels that land on the same point", () => {
    const host = document.createElement("div");
    const layer = createLabelLayer(host, { rank: (id) => (id === "keep" ? 1 : 7) });
    layer.set("drop", "drop", [0, 0, 0], "node");
    layer.set("keep", "keep", [0, 0, 0], "node");
    drawAt(host, 44, 16);
    layer.update(camera(), 200, 200);

    expect(host.querySelector<HTMLElement>("span.node")?.hidden).toBe(true);
    expect(host.querySelectorAll<HTMLElement>("span")[1]?.hidden).toBe(false);
    layer.dispose();
  });

  it("keeps both labels when their rectangles stand clear of each other", () => {
    const host = document.createElement("div");
    const layer = createLabelLayer(host, { rank: (id) => (id === "keep" ? 1 : 7) });
    layer.set("drop", "drop", [0, 0, 0], "node");
    layer.set("keep", "keep", [3, 0, 0], "node");
    drawAt(host, 44, 16);
    layer.update(camera(), 200, 200);

    for (const span of host.querySelectorAll<HTMLElement>("span")) expect(span.hidden).toBe(false);
    layer.dispose();
  });

  it("shows a label again once the crowding one is gone", () => {
    const host = document.createElement("div");
    const layer = createLabelLayer(host, { rank: (id) => (id === "keep" ? 1 : 7) });
    layer.set("drop", "drop", [0, 0, 0], "node");
    layer.set("keep", "keep", [0, 0, 0], "node");
    drawAt(host, 44, 16);
    layer.update(camera(), 200, 200);
    const dropped = host.querySelector<HTMLElement>("span");
    expect(dropped?.hidden).toBe(true);

    layer.remove("keep");
    layer.update(camera(), 200, 200);
    expect(dropped?.hidden).toBe(false);
    layer.dispose();
  });

  it("re-measures a label after its text changes, so a longer word crowds more", () => {
    const host = document.createElement("div");
    const layer = createLabelLayer(host, { rank: (id) => (id === "keep" ? 1 : 7) });
    layer.set("keep", "keep", [0, 0, 0], "node");
    layer.set("drop", "drop", [1.2, 0, 0], "node");
    drawAt(host, 20, 16);
    layer.update(camera(), 200, 200);
    const spans = host.querySelectorAll<HTMLElement>("span");
    expect(spans[1]?.hidden).toBe(false);

    layer.set("keep", "keep at length", [0, 0, 0], "node");
    drawAt(host, 120, 16);
    layer.update(camera(), 200, 200);
    expect(spans[1]?.hidden).toBe(true);
    layer.dispose();
  });

  it("leaves overlapping labels alone when no rank function is given", () => {
    const host = document.createElement("div");
    const layer = createLabelLayer(host);
    layer.set("a", "a", [0, 0, 0], "node");
    layer.set("b", "b", [0, 0, 0], "node");
    drawAt(host, 44, 16);
    layer.update(camera(), 200, 200);

    for (const span of host.querySelectorAll<HTMLElement>("span")) expect(span.hidden).toBe(false);
    layer.dispose();
  });

  it("never places a label that projects off the canvas, whatever its rank", () => {
    const host = document.createElement("div");
    const layer = createLabelLayer(host, { rank: () => 0 });
    layer.set("off", "off", [30, 0, 0], "node");
    drawAt(host, 44, 16);
    layer.update(camera(), 200, 200);

    expect(host.querySelector<HTMLElement>("span")?.hidden).toBe(true);
    layer.dispose();
  });

  it("boxes an op label around its point and other kinds above it", () => {
    const host = document.createElement("div");
    const layer = createLabelLayer(host, { rank: (id) => (id === "anchor" ? 0 : 9) });
    // 16px below the anchor's point: clear of a label that hangs above its point, but half
    // covered by one centred on it.
    const under: Vec3 = [0, 0, -0.66273];
    const cam = camera();
    cam.updateMatrixWorld();
    expect(projectToPixels([0, 0, 0], cam, 200, 200)?.map(Math.round)).toEqual([100, 100]);
    expect(projectToPixels(under, cam, 200, 200)?.map(Math.round)).toEqual([100, 116]);

    layer.set("anchor", "+", [0, 0, 0], "op");
    layer.set("under", "u", under, "node");
    drawAt(host, 30, 16);
    layer.update(camera(), 200, 200);
    const underSpan = host.querySelectorAll<HTMLElement>("span")[1];
    expect(underSpan?.textContent).toBe("u");
    expect(underSpan?.hidden).toBe(true);

    layer.set("anchor", "+", [0, 0, 0], "node");
    layer.update(camera(), 200, 200);
    expect(underSpan?.hidden).toBe(false);
    layer.dispose();
  });
});
