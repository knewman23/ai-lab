// @vitest-environment jsdom
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera } from "three";
import { describe, expect, it, vi } from "vitest";
import { createColumnHits, createColumnPick } from "../../../src/viz/gpt/column-pick";
import { BAND_Z, COLUMN_X, columnX } from "../../../src/viz/gpt/layout";

/**
 * The 200x200 canvas of `shared/drag`'s tests, seen by a Z-up camera one unit along -y: the
 * visible half-extent on the wall plane y = 0 is one unit, so screen x 0..200 spans world
 * x -1..1 and screen y 0..200 spans world z 1..-1.
 */
const SIZE = 200;
/** Screen points over the first target, the second target, and bare wall between them. */
const ON_FIRST: readonly [number, number] = [50, 100];
const ON_SECOND: readonly [number, number] = [150, 100];
const OFF_BOTH: readonly [number, number] = [100, 20];

function pointer(type: string, x: number, y: number, pointerId = 1): PointerEvent {
  // MouseEvent rather than PointerEvent, as in the drag tests: jsdom's PointerEvent
  // support varies and the handlers read only pointerId, clientX and clientY.
  const event = new MouseEvent(type, { clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event as PointerEvent;
}

function fakeCanvas(): HTMLDivElement {
  const canvas = document.createElement("div");
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
  } as DOMRect);
  return canvas;
}

function box(x: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(0.4, 0.4, 0.4), new MeshBasicMaterial({ visible: false }));
  mesh.position.set(x, 0, 0);
  mesh.updateMatrixWorld();
  return mesh;
}

function harness() {
  const canvas = fakeCanvas();
  const camera = new PerspectiveCamera(90, 1, 0.1, 100);
  camera.position.set(0, -1, 0);
  // Without a Z-up camera, looking straight along +y from -y is degenerate.
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const onSelect = vi.fn<(index: number) => void>();
  const detach = createColumnPick({
    canvas,
    camera,
    targets: [box(-0.5), box(0.5)],
    onSelect,
  });

  const send = (type: string, [x, y]: readonly [number, number], id = 1): void => {
    canvas.dispatchEvent(pointer(type, x, y, id));
  };
  return { canvas, onSelect, detach, send };
}

describe("createColumnPick", () => {
  it("selects the target a press and release landed on", () => {
    const { onSelect, detach, send } = harness();
    send("pointerdown", ON_SECOND);
    send("pointerup", ON_SECOND);
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(onSelect).toHaveBeenCalledTimes(1);

    send("pointerdown", ON_FIRST);
    send("pointerup", ON_FIRST);
    expect(onSelect).toHaveBeenLastCalledWith(0);
    detach();
  });

  it("tolerates the slop an unsteady click carries", () => {
    const { onSelect, detach, send } = harness();
    send("pointerdown", ON_SECOND);
    send("pointerup", [ON_SECOND[0] + 4, ON_SECOND[1] + 3]);
    expect(onSelect).toHaveBeenCalledWith(1);
    detach();
  });

  it("stays quiet when the pointer travelled far enough to be an orbit", () => {
    const { onSelect, detach, send } = harness();
    send("pointerdown", ON_SECOND);
    send("pointerup", [ON_SECOND[0] + 40, ON_SECOND[1]]);
    expect(onSelect).not.toHaveBeenCalled();
    detach();
  });

  it("stays quiet for a press held longer than a click", () => {
    vi.useFakeTimers();
    try {
      const { onSelect, detach, send } = harness();
      send("pointerdown", ON_SECOND);
      vi.advanceTimersByTime(500);
      send("pointerup", ON_SECOND);
      expect(onSelect).not.toHaveBeenCalled();
      detach();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stays quiet when the ray misses every target", () => {
    const { onSelect, detach, send } = harness();
    send("pointerdown", OFF_BOTH);
    send("pointerup", OFF_BOTH);
    expect(onSelect).not.toHaveBeenCalled();
    detach();
  });

  it("ignores a release from a different pointer than the press", () => {
    const { onSelect, detach, send } = harness();
    send("pointerdown", ON_SECOND, 1);
    send("pointerup", ON_SECOND, 2);
    expect(onSelect).not.toHaveBeenCalled();
    detach();
  });

  it("hears nothing more once detached", () => {
    const { onSelect, detach, send } = harness();
    detach();
    send("pointerdown", ON_SECOND);
    send("pointerup", ON_SECOND);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("listens for the press in the capture phase, ahead of OrbitControls", () => {
    const canvas = fakeCanvas();
    const spy = vi.spyOn(canvas, "addEventListener");
    const camera = new PerspectiveCamera(90, 1, 0.1, 100);
    const detach = createColumnPick({ canvas, camera, targets: [], onSelect: vi.fn() });
    expect(spy).toHaveBeenCalledWith("pointerdown", expect.any(Function), true);
    detach();
  });
});

describe("createColumnHits", () => {
  it("is one grabbable box per column, centred on the column's line", () => {
    const hits = createColumnHits();
    expect(hits.targets).toHaveLength(COLUMN_X.length);
    hits.targets.forEach((mesh, i) => {
      expect(mesh.position.x).toBeCloseTo(columnX(i), 9);
      expect(mesh.position.z).toBeCloseTo((BAND_Z.embed + BAND_Z.mlp) / 2, 9);
      // An invisible material on a visible mesh: three's Raycaster tests layers, not `visible`.
      expect(mesh.visible).toBe(true);
      expect((mesh.material as MeshBasicMaterial).visible).toBe(false);
    });
    hits.dispose();
  });

  it("spans the column's bands so a glyph at either end is still clickable", () => {
    const hits = createColumnHits();
    const mesh = hits.targets[0]!;
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    const half = (box.max.z - box.min.z) / 2;
    expect(mesh.position.z - half).toBeLessThan(BAND_Z.embed);
    expect(mesh.position.z + half).toBeGreaterThan(BAND_Z.mlp);
    // Narrower than the 1.2 column pitch, so neighbouring boxes never overlap.
    expect(box.max.x - box.min.x).toBeLessThan(1.2);
    hits.dispose();
  });
});
