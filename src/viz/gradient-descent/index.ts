import { isFinitePoint } from "../../core/math/numeric";
import type { OptimizerKey } from "../../core/math/optimizers";
import { SURFACES, type SurfaceKey } from "../../core/math/surfaces";
import { backendName } from "../../core/renderer";
import { createSceneKit, disposeObject, prefersReducedMotion } from "../../core/scene";
import type { Visualization, VizHost, VizInstance } from "../types";
import { createContourLines } from "./contour-lines";
import { attachDrag } from "./drag";
import { frameFor, type Framing } from "./framing";
import { createMarker } from "./marker";
import { createGdPanel } from "./panel";
import { createPathLine } from "./path-line";
import { createRunTimer } from "./run-timer";
import { createSurfaceMesh } from "./surface-mesh";
import {
  PATH_CAPACITY,
  derived,
  drag,
  initialState,
  reset,
  setLr,
  setOptimizer,
  setShow,
  setSurface,
  step,
  toggleRun,
  type GdState,
  type ShowKey,
} from "./state";

/** Steps per second while Run is on; slower when the visitor asked for less motion. */
const RUN_HZ = 10;
const REDUCED_RUN_HZ = 2;

function mount(host: VizHost): VizInstance {
  const reducedMotion = prefersReducedMotion();
  const kit = createSceneKit(host.renderer, host.theme, { reducedMotion });

  const surfaceMesh = createSurfaceMesh(host.theme);
  const contours = createContourLines(host.theme);
  const marker = createMarker(host.theme);
  const path = createPathLine(host.theme, PATH_CAPACITY);
  kit.scene.add(surfaceMesh.group, contours.object, marker.group, path.group);

  const runTimer = createRunTimer(reducedMotion ? REDUCED_RUN_HZ : RUN_HZ);

  let state: GdState = initialState();
  let dirty = true;
  let prevSurface: SurfaceKey | undefined;
  let home: Framing | undefined;

  function goHome(): void {
    if (!home) return;
    kit.camera.position.set(...home.position);
    kit.controls.target.set(...home.target);
    kit.controls.update();
  }

  function apply(next: GdState): void {
    state = next;
    const surface = SURFACES[state.surface];

    if (state.surface !== prevSurface) {
      const grid = surfaceMesh.setSurface(surface);
      contours.setSurface(surface, grid);
      home = frameFor(surface, grid.heightRange);
      goHome();
      prevSurface = state.surface;
    }

    // A diverged step has no drawable position; leaving the marker where it
    // was keeps the last valid frame on screen until Reset or a drag.
    if (isFinitePoint(state.pos)) marker.setPosition(surface, state.pos);
    path.sync(surface, state.path);

    marker.setTangentVisible(state.show.tangent);
    contours.setVisible(state.show.contours);
    path.setVisible(state.show.path);

    panel.render(state, derived(state));
    dirty = true;
  }

  const panel = createGdPanel(
    host.panel,
    {
      onSurface: (key: SurfaceKey) => apply(setSurface(state, key)),
      onOptimizer: (key: OptimizerKey) => apply(setOptimizer(state, key)),
      onLr: (lr: number) => apply(setLr(state, lr)),
      onStep: () => apply(step(state)),
      onToggleRun: () => {
        runTimer.reset();
        apply(toggleRun(state));
      },
      onReset: () => apply(reset(state)),
      onResetView: () => {
        goHome();
        dirty = true;
      },
      onShow: (key: ShowKey, on: boolean) => apply(setShow(state, key, on)),
    },
    { backend: backendName(host.renderer) },
  );

  const detachDrag = attachDrag({
    canvas: host.renderer.domElement,
    camera: kit.camera,
    controls: kit.controls,
    hitTarget: marker.hitTarget,
    getSurface: () => SURFACES[state.surface],
    getPosition: () => state.pos,
    onDrag: (p) => apply(drag(state, p)),
  });

  function onThemeChange(): void {
    dirty = true;
  }
  host.theme.addEventListener("change", onThemeChange);

  apply(state);

  return {
    update(dt: number): boolean {
      if (state.running && runTimer.advance(dt) > 0) apply(step(state));
      // Damping keeps the camera moving for a moment after the pointer stops.
      const moved = kit.controls.update(dt);
      if (!dirty && !moved) return false;
      host.renderer.render(kit.scene, kit.camera);
      dirty = false;
      return true;
    },

    resize(w: number, h: number): void {
      kit.camera.aspect = w / h;
      kit.camera.updateProjectionMatrix();
      dirty = true;
    },

    dispose(): void {
      host.theme.removeEventListener("change", onThemeChange);
      detachDrag();
      path.dispose();
      marker.dispose();
      contours.dispose();
      surfaceMesh.dispose();
      panel.dispose();
      disposeObject(kit.scene);
      kit.dispose();
    },
  };
}

export const gradientDescent: Visualization = {
  id: "gradient-descent",
  topic: "machine-learning",
  title: "Gradient descent",
  summary:
    "Drag a point across a 3D loss surface and watch the gradient, the tangent plane and the optimizer's path respond.",
  status: "ready",
  mount,
};
