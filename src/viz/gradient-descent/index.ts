import { isFinitePoint } from "../../core/math/numeric";
import type { OptimizerKey } from "../../core/math/optimizers";
import { SURFACES, clampToDomain, type SurfaceKey } from "../../core/math/surfaces";
import { backendName } from "../../core/renderer";
import { createSceneKit, disposeObject, prefersReducedMotion } from "../../core/scene";
import type { Visualization, VizHost, VizInstance } from "../types";
import { createContourLines } from "./contour-lines";
import { attachDrag } from "../shared/drag";
import { frameFor, type Framing } from "../shared/framing";
import { createUsageHint, type UsageHint } from "../shared/hint";
import { createMarker } from "./marker";
import { createGdPanel, type GdControlId, type GdPanel } from "./panel";
import { createPathLine } from "./path-line";
import { createRunTimer } from "./run-timer";
import { createSurfaceMesh } from "./surface-mesh";
import { createWalkthrough } from "../shared/walkthrough";
import { GD_STEPS, GD_WALKTHROUGH_TITLE } from "./walkthrough";
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

const HINT = {
  storageKey: "ai-lab.hint.gradient-descent",
  heading: "How to explore",
  lines: [
    "Drag the ball to move it, or click anywhere on the surface to place it.",
    "Drag the background to orbit; scroll to zoom; right-drag (or two fingers) to pan.",
    "Step or Run in the panel; Reset view re-frames the camera.",
  ],
};

/** Steps per second while Run is on; slower when the visitor asked for less motion. */
const RUN_HZ = 10;
const REDUCED_RUN_HZ = 2;

/**
 * Builds the scene-side objects. If any one of them throws, the ones already
 * built are disposed in reverse order before the error is rethrown, so a
 * half-finished mount never leaks GPU resources. The returned `unwind` lets
 * the caller do the same for a failure later in the mount.
 */
function buildScene(host: VizHost, reducedMotion: boolean) {
  const built: Array<() => void> = [];
  const unwind = (): void => {
    for (let i = built.length - 1; i >= 0; i -= 1) built[i]?.();
  };

  try {
    const kit = createSceneKit(host.renderer, host.theme, { reducedMotion });
    built.push(() => {
      disposeObject(kit.scene);
      kit.dispose();
    });

    const surfaceMesh = createSurfaceMesh(host.theme);
    built.push(() => {
      surfaceMesh.dispose();
    });

    const contours = createContourLines(host.theme);
    built.push(() => {
      contours.dispose();
    });

    const marker = createMarker(host.theme);
    built.push(() => {
      marker.dispose();
    });

    const path = createPathLine(host.theme, PATH_CAPACITY);
    built.push(() => {
      path.dispose();
    });

    kit.scene.add(surfaceMesh.group, contours.object, marker.group, path.group);

    return { kit, surfaceMesh, contours, marker, path, unwind };
  } catch (error) {
    unwind();
    throw error;
  }
}

function mount(host: VizHost): VizInstance {
  const reducedMotion = prefersReducedMotion();
  const { kit, surfaceMesh, contours, marker, path, unwind } = buildScene(host, reducedMotion);

  const runTimer = createRunTimer(reducedMotion ? REDUCED_RUN_HZ : RUN_HZ);

  let state: GdState = initialState();
  let dirty = true;
  let prevSurface: SurfaceKey | undefined;
  let home: Framing | undefined;
  // Declared before `apply` because the panel's handlers can call `apply`
  // while the panel is still being constructed.
  let panel: GdPanel | undefined;

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
      home = frameFor(surface.domain, grid.heightRange);
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

    panel?.render(state, derived(state));
    dirty = true;
  }

  let detachDrag: (() => void) | undefined;
  let hint: UsageHint | undefined;

  try {
    panel = createGdPanel(
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

    hint = createUsageHint(host.canvasContainer, HINT);

    detachDrag = attachDrag({
      canvas: host.renderer.domElement,
      camera: kit.camera,
      controls: kit.controls,
      hitTargets: [marker.hitTarget],
      surfaceTarget: surfaceMesh.group,
      // The marker's drawn height, which is where the drag plane sits.
      getPlaneZ: () => {
        const surface = SURFACES[state.surface];
        return surface.scale * surface.f(state.pos[0], state.pos[1]);
      },
      clamp: (p) => clampToDomain(SURFACES[state.surface], p),
      onDrag: (_index, p) => {
        // The first move of the ball is proof the hint has been read.
        hint?.hide();
        apply(drag(state, p));
      },
    });
  } catch (error) {
    hint?.dispose();
    panel?.dispose();
    unwind();
    throw error;
  }

  function onThemeChange(): void {
    dirty = true;
  }
  host.theme.addEventListener("change", onThemeChange);

  apply(state);

  const walkthrough = createWalkthrough<GdState, GdControlId>({
    title: GD_WALKTHROUGH_TITLE,
    steps: GD_STEPS,
    initial: initialState,
    apply,
    focus: (id) => panel?.focus(id),
    frame: () => {
      goHome();
    },
  });

  return {
    walkthrough,

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
      detachDrag?.();
      hint?.dispose();
      path.dispose();
      marker.dispose();
      contours.dispose();
      surfaceMesh.dispose();
      panel?.dispose();
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
