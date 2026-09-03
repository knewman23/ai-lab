// @vitest-environment jsdom
import {
  Group,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { describe, expect, it, vi } from "vitest";
import type { Vec2 } from "../../../src/core/math/numeric";
import { attachDrag, type DragBase, type DragOptions } from "../../../src/viz/shared/drag";

/**
 * A 200x200 canvas viewed by a 90-degree camera one unit in front of the z = 0
 * plane makes the screen/world mapping arithmetic rather than guesswork: the
 * visible half-extent at z = 0 is exactly one unit, so screen x 0..200 spans
 * world x -1..1 and screen y 0..200 spans world y 1..-1.
 */
const SIZE = 200;
const BALL_X = 0.5;
/** Screen point over the first ball, one over the second, one over bare surface. */
const ON_BALL: readonly [number, number] = [150, 100];
const ON_BALL_2: readonly [number, number] = [50, 100];
const OFF_BALL: readonly [number, number] = [50, 180];

/** The short y range the gradient scene's domain clamp stands in for here. */
function clampY(p: Vec2): Vec2 {
  return [p[0], Math.min(Math.max(p[1], -0.2), 0.2)];
}

function pointer(type: string, x: number, y: number, pointerId = 1): PointerEvent {
  // MouseEvent rather than PointerEvent: jsdom's PointerEvent support varies,
  // and the handlers only read pointerId, clientX and clientY.
  const event = new MouseEvent(type, { clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event as PointerEvent;
}

/** A div standing in for the canvas: a stubbed 200x200 rect and inert pointer capture. */
function fakeCanvas(): HTMLDivElement {
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
  return canvas;
}

function ball(x: number): Mesh {
  const mesh = new Mesh(new SphereGeometry(0.2, 8, 8));
  mesh.position.set(x, 0, 0);
  mesh.updateMatrixWorld();
  return mesh;
}

type Overrides = Partial<Pick<DragBase, "hitTargets" | "enabled">> & {
  getPlaneZ?: (index: number) => number;
  surfaceTarget?: Object3D | null;
};

function harness(overrides: Overrides = {}) {
  const canvas = fakeCanvas();

  const camera = new PerspectiveCamera(90, 1, 0.1, 100);
  camera.position.set(0, 0, 1);
  camera.updateMatrixWorld();

  const surfaceTarget = new Group();
  surfaceTarget.add(new Mesh(new PlaneGeometry(4, 4)));
  surfaceTarget.updateMatrixWorld(true);

  const controls = { enabled: true } as OrbitControls;
  const onDrag = vi.fn<(index: number, pos: Vec2) => void>();
  const getPlaneZ = vi.fn<(index: number) => number>(() => 0);

  const detach = attachDrag({
    canvas,
    camera,
    controls,
    hitTargets: overrides.hitTargets ?? [ball(BALL_X)],
    getPlaneZ: overrides.getPlaneZ ?? getPlaneZ,
    clamp: clampY,
    ...(overrides.enabled ? { enabled: overrides.enabled } : {}),
    ...(overrides.surfaceTarget === null ? {} : { surfaceTarget }),
    onDrag,
  });

  const send = (type: string, [x, y]: readonly [number, number], id = 1): void => {
    canvas.dispatchEvent(pointer(type, x, y, id));
  };

  return { canvas, controls, onDrag, getPlaneZ, detach, send };
}

/**
 * The same 200x200 rect seen by a Z-up camera one unit along -y, so the drag
 * plane is the vertical y = 0 slice: screen x 0..200 still spans world x -1..1
 * and screen y 0..200 spans world z 1..-1.
 */
function verticalHarness() {
  const canvas = fakeCanvas();

  const camera = new PerspectiveCamera(90, 1, 0.1, 100);
  camera.position.set(0, -1, 0);
  // Without a Z-up camera, looking straight along +y from -y is degenerate.
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  // On the plane at world (0.5, 0, 0.5), which is screen (150, 50).
  const target = new Mesh(new SphereGeometry(0.2, 8, 8));
  target.position.set(BALL_X, 0, 0.5);
  target.updateMatrixWorld();

  const controls = { enabled: true } as OrbitControls;
  const onDrag = vi.fn<(index: number, pos: Vec2) => void>();

  const detach = attachDrag({
    canvas,
    camera,
    controls,
    hitTargets: [target],
    plane: { normal: new Vector3(0, 1, 0), getOffset: () => 0 },
    onDrag,
  });

  const send = (type: string, [x, y]: readonly [number, number], id = 1): void => {
    canvas.dispatchEvent(pointer(type, x, y, id));
  };

  return { canvas, controls, onDrag, detach, send };
}

/** Screen point over the wall ball, one over the floor ball, one to drag either to. */
const ON_WALL_BALL: readonly [number, number] = [150, 50];
const ON_FLOOR_BALL: readonly [number, number] = [50, 150];
const OBLIQUE_MOVE: readonly [number, number] = [130, 150];

/**
 * The same rect seen by a Z-up camera at (0, -1, 1) looking at the origin, so
 * that the y = 0 wall and the z = 0 floor meet a pointer ray at different
 * points. With forward (0, 1, -1)/sqrt2, right (1, 0, 0) and camera-up
 * (0, 1, 1)/sqrt2, the ray for NDC (nx, ny) leaves the camera along
 * (nx, (1+ny)/sqrt2, (ny-1)/sqrt2), so it meets
 *   y = 0 at x = nx*sqrt2/(1+ny), z = 2ny/(1+ny), and
 *   z = 0 at x = nx*sqrt2/(1-ny), y = 2ny/(1-ny).
 * Ball 0 sits on the wall under ON_WALL_BALL (nx = ny = 0.5) and ball 1 on the
 * floor under ON_FLOOR_BALL (nx = ny = -0.5).
 */
function obliqueHarness(normal: (index: number) => Vector3) {
  const canvas = fakeCanvas();

  const camera = new PerspectiveCamera(90, 1, 0.1, 100);
  camera.position.set(0, -1, 1);
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const wallBall = new Mesh(new SphereGeometry(0.2, 8, 8));
  wallBall.position.set(Math.SQRT2 / 3, 0, 2 / 3);
  wallBall.updateMatrixWorld();
  const floorBall = new Mesh(new SphereGeometry(0.2, 8, 8));
  floorBall.position.set(-Math.SQRT2 / 3, -2 / 3, 0);
  floorBall.updateMatrixWorld();

  const controls = { enabled: true } as OrbitControls;
  const onDrag = vi.fn<(index: number, pos: Vec2) => void>();

  const detach = attachDrag({
    canvas,
    camera,
    controls,
    hitTargets: [wallBall, floorBall],
    plane: { normal, getOffset: () => 0 },
    onDrag,
  });

  const send = (type: string, [x, y]: readonly [number, number], id = 1): void => {
    canvas.dispatchEvent(pointer(type, x, y, id));
  };

  return { onDrag, detach, send };
}

/**
 * Type-level only, never called: the plane source is a union, so the compiler
 * has to reject options that give both sources or neither.
 */
const typecheckOnly = (base: DragBase): void => {
  // @ts-expect-error - getPlaneZ and plane are mutually exclusive
  const both: DragOptions = {
    ...base,
    getPlaneZ: () => 0,
    plane: { normal: new Vector3(0, 1, 0), getOffset: () => 0 },
  };
  // @ts-expect-error - one of getPlaneZ and plane is required
  const neither: DragOptions = { ...base };
  void both;
  void neither;
};
void typecheckOnly;

/** The single (index, Vec2) pair a single onDrag call received. */
function only(onDrag: ReturnType<typeof harness>["onDrag"]): [number, Vec2] {
  expect(onDrag).toHaveBeenCalledTimes(1);
  const call = onDrag.mock.calls[0]!;
  return [call[0], call[1]];
}

describe("attachDrag", () => {
  it("drags the ball, clamping the result and suspending orbit", () => {
    const { controls, onDrag, detach, send } = harness();

    send("pointerdown", ON_BALL);
    expect(controls.enabled).toBe(false);

    // Screen y 20 is world y 0.8, which the clamp brings back to 0.2.
    send("pointermove", [100, 20]);
    const [index, [x, y]] = only(onDrag);
    expect(index).toBe(0);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0.2, 6);

    send("pointerup", [100, 20]);
    expect(controls.enabled).toBe(true);

    detach();
  });

  it("reports which of several hit targets was grabbed", () => {
    const targets = [ball(BALL_X), ball(-BALL_X)];
    const { onDrag, getPlaneZ, detach, send } = harness({ hitTargets: targets });

    send("pointerdown", ON_BALL_2);
    send("pointermove", [100, 100]);

    expect(only(onDrag)[0]).toBe(1);
    expect(getPlaneZ).toHaveBeenCalledWith(1);

    detach();
  });

  it("drags on a plane at the height getPlaneZ reports", () => {
    const getPlaneZ = vi.fn(() => 0.5);
    const { onDrag, detach, send } = harness({ getPlaneZ });

    send("pointerdown", ON_BALL);
    // The camera sits at z = 1, so a plane at z = 0.5 is half as far away and
    // the same screen point maps to half the world offset.
    send("pointermove", [200, 100]);

    expect(getPlaneZ).toHaveBeenCalledWith(0);
    expect(only(onDrag)[1][0]).toBeCloseTo(0.5, 6);

    detach();
  });

  it("places the ball where a quick click met the surface", () => {
    const { onDrag, detach, send } = harness();

    send("pointerdown", OFF_BALL);
    expect(onDrag).not.toHaveBeenCalled();

    // Released 3 px right and 2 px down of the press: still a click, and the
    // marker lands under the release rather than under the press.
    send("pointerup", [53, 182]);
    const [index, [x, y]] = only(onDrag);
    expect(index).toBe(-1);
    expect(x).toBeCloseTo(-0.47, 6);
    // World y -0.82 under the release, clamped back into the short range.
    expect(y).toBeCloseTo(-0.2, 6);

    detach();
  });

  it("ignores a click when no surface target was given", () => {
    const { onDrag, detach, send } = harness({ surfaceTarget: null });

    send("pointerdown", OFF_BALL);
    send("pointerup", OFF_BALL);

    expect(onDrag).not.toHaveBeenCalled();

    detach();
  });

  it("leaves the ball alone when the press travelled far enough to be an orbit", () => {
    const { onDrag, detach, send } = harness();

    send("pointerdown", OFF_BALL);
    send("pointerup", [70, 180]);

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

  it("starts no drag and clears a stale cursor while dragging is disabled", () => {
    const { canvas, controls, onDrag, detach, send } = harness({ enabled: () => false });

    // Left over from a moment when dragging was still allowed.
    canvas.style.cursor = "grab";

    send("pointerdown", ON_BALL);
    expect(controls.enabled).toBe(true);

    send("pointermove", [100, 20]);
    expect(onDrag).not.toHaveBeenCalled();

    send("pointermove", ON_BALL);
    expect(canvas.style.cursor).toBe("");

    detach();
  });

  it("places nothing on a click while dragging is disabled", () => {
    const { onDrag, detach, send } = harness({ enabled: () => false });

    send("pointerdown", OFF_BALL);
    send("pointerup", OFF_BALL);

    expect(onDrag).not.toHaveBeenCalled();

    detach();
  });

  it("drags on a vertical plane when one is given instead of getPlaneZ", () => {
    const { onDrag, detach, send } = verticalHarness();

    send("pointerdown", [150, 50]);
    // Screen x 70 is world x -0.3 on the y = 0 plane, one unit from the camera.
    send("pointermove", [70, 120]);

    const [index, [x, y]] = only(onDrag);
    expect(index).toBe(0);
    expect(x).toBeCloseTo(-0.3, 6);
    // The hit's world y: the drag plane itself, reported unchanged.
    expect(y).toBeCloseTo(0, 6);

    detach();
  });

  it("asks the plane normal for the grabbed target and drags the wall ball on y = 0", () => {
    const normal = vi.fn((i: number) => (i === 1 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0)));
    const { onDrag, detach, send } = obliqueHarness(normal);

    send("pointerdown", ON_WALL_BALL);
    // OBLIQUE_MOVE is NDC (0.3, -0.5): on y = 0, x = 0.3*sqrt2/0.5.
    send("pointermove", OBLIQUE_MOVE);

    expect(normal).toHaveBeenCalledWith(0);
    expect(normal).not.toHaveBeenCalledWith(1);
    const [index, [x, y]] = only(onDrag);
    expect(index).toBe(0);
    expect(x).toBeCloseTo(0.6 * Math.SQRT2, 6);
    expect(y).toBeCloseTo(0, 6);

    detach();
  });

  it("asks the plane normal for the grabbed target and drags the floor ball on z = 0", () => {
    const normal = vi.fn((i: number) => (i === 1 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0)));
    const { onDrag, detach, send } = obliqueHarness(normal);

    send("pointerdown", ON_FLOOR_BALL);
    // The same screen point on z = 0: x = 0.3*sqrt2/1.5, y = 2*(-0.5)/1.5.
    send("pointermove", OBLIQUE_MOVE);

    expect(normal).toHaveBeenCalledWith(1);
    expect(normal).not.toHaveBeenCalledWith(0);
    const [index, [x, y]] = only(onDrag);
    expect(index).toBe(1);
    expect(x).toBeCloseTo(0.2 * Math.SQRT2, 6);
    expect(y).toBeCloseTo(-2 / 3, 6);

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
