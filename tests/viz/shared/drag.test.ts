// @vitest-environment jsdom
import { Group, Mesh, PerspectiveCamera, PlaneGeometry, SphereGeometry } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { describe, expect, it, vi } from "vitest";
import type { Vec2 } from "../../../src/core/math/numeric";
import type { Surface } from "../../../src/core/math/surfaces";
import { attachDrag } from "../../../src/viz/shared/drag";

/**
 * A 200x200 canvas viewed by a 90-degree camera one unit in front of the z = 0
 * plane makes the screen/world mapping arithmetic rather than guesswork: the
 * visible half-extent at z = 0 is exactly one unit, so screen x 0..200 spans
 * world x -1..1 and screen y 0..200 spans world y 1..-1.
 */
const SIZE = 200;
const BALL_X = 0.5;
/** Screen point over the ball, and one over bare surface well away from it. */
const ON_BALL: readonly [number, number] = [150, 100];
const OFF_BALL: readonly [number, number] = [50, 100];

/** Flat and centred, with a deliberately short y range so clamping is visible. */
const surface: Surface = {
  key: "bowl",
  title: "Test",
  f: () => 0,
  grad: () => [0, 0],
  domain: { x: [-1, 1], y: [-0.2, 0.2] },
  scale: 1,
  start: [0, 0],
  defaultLr: 0.1,
  hint: "",
};

function pointer(type: string, x: number, y: number, pointerId = 1): PointerEvent {
  // MouseEvent rather than PointerEvent: jsdom's PointerEvent support varies,
  // and the handlers only read pointerId, clientX and clientY.
  const event = new MouseEvent(type, { clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event as PointerEvent;
}

function harness() {
  const canvas = document.createElement("div");
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
  } as DOMRect);
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  canvas.hasPointerCapture = vi.fn(() => false);

  const camera = new PerspectiveCamera(90, 1, 0.1, 100);
  camera.position.set(0, 0, 1);
  camera.updateMatrixWorld();

  const hitTarget = new Mesh(new SphereGeometry(0.2, 8, 8));
  hitTarget.position.set(BALL_X, 0, 0);
  hitTarget.updateMatrixWorld();

  const surfaceTarget = new Group();
  surfaceTarget.add(new Mesh(new PlaneGeometry(4, 4)));
  surfaceTarget.updateMatrixWorld(true);

  const controls = { enabled: true } as OrbitControls;
  const onDrag = vi.fn<(pos: Vec2) => void>();
  let position: Vec2 = [0, 0];

  const detach = attachDrag({
    canvas,
    camera,
    controls,
    hitTarget,
    surfaceTarget,
    getSurface: () => surface,
    getPosition: () => position,
    onDrag: (p) => {
      position = p;
      onDrag(p);
    },
  });

  const send = (type: string, [x, y]: readonly [number, number], id = 1): void => {
    canvas.dispatchEvent(pointer(type, x, y, id));
  };

  return { canvas, controls, onDrag, detach, send };
}

/** The single Vec2 a single onDrag call received. */
function only(onDrag: ReturnType<typeof harness>["onDrag"]): Vec2 {
  expect(onDrag).toHaveBeenCalledTimes(1);
  return onDrag.mock.calls[0]![0];
}

describe("attachDrag", () => {
  it("drags the ball, clamping to the domain and suspending orbit", () => {
    const { controls, onDrag, detach, send } = harness();

    send("pointerdown", ON_BALL);
    expect(controls.enabled).toBe(false);

    // Screen y 20 is world y 0.8, which the short domain clamps back to 0.2.
    send("pointermove", [100, 20]);
    const [x, y] = only(onDrag);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0.2, 6);

    send("pointerup", [100, 20]);
    expect(controls.enabled).toBe(true);

    detach();
  });

  it("places the ball where a quick click met the surface", () => {
    const { onDrag, detach, send } = harness();

    send("pointerdown", OFF_BALL);
    expect(onDrag).not.toHaveBeenCalled();

    // Released 3 px right and 2 px down of the press: still a click, and the
    // marker lands under the release rather than under the press.
    send("pointerup", [53, 102]);
    const [x, y] = only(onDrag);
    expect(x).toBeCloseTo(-0.47, 6);
    expect(y).toBeCloseTo(-0.02, 6);

    detach();
  });

  it("leaves the ball alone when the press travelled far enough to be an orbit", () => {
    const { onDrag, detach, send } = harness();

    send("pointerdown", OFF_BALL);
    send("pointerup", [70, 100]);

    expect(onDrag).not.toHaveBeenCalled();

    detach();
  });

  it("offers a grab cursor over the ball and clears it elsewhere", () => {
    const { canvas, onDrag, detach, send } = harness();

    send("pointermove", ON_BALL);
    expect(canvas.style.cursor).toBe("grab");

    send("pointermove", OFF_BALL);
    expect(canvas.style.cursor).toBe("");
    expect(onDrag).not.toHaveBeenCalled();

    detach();
  });

  it("stops listening and restores the cursor once detached", () => {
    const { canvas, controls, onDrag, detach, send } = harness();

    send("pointermove", ON_BALL);
    expect(canvas.style.cursor).toBe("grab");

    detach();
    expect(canvas.style.cursor).toBe("");

    send("pointerdown", ON_BALL);
    send("pointermove", [100, 20]);

    expect(onDrag).not.toHaveBeenCalled();
    expect(controls.enabled).toBe(true);
  });
});
