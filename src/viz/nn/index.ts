import type { DatasetKey } from "../../core/math/datasets";
import { boundaryGrid, type Params } from "../../core/math/mlp";
import type { Vec2 } from "../../core/math/numeric";
import { createSceneKit, disposeObject, prefersReducedMotion } from "../../core/scene";
import { attachDrag } from "../shared/drag";
import type { Framing } from "../shared/framing";
import { createUsageHint, type UsageHint } from "../shared/hint";
import { createLabelLayer } from "../shared/labels";
import { createWall } from "../shared/wall";
import type { Visualization, VizHost, VizInstance } from "../types";
import { createFloor } from "./floor";
import { frameNn } from "./frame-nn";
import { syncLabels } from "./labels-sync";
import { inputFromFloor, WALL_H, WALL_OPACITY, WALL_W } from "./layout";
import { createNeurons } from "./neurons";
import { createNnPanel, type NnPanel } from "./panel";
import { createPoints } from "./points";
import { createProbe } from "./probe";
import {
  derived,
  EPOCH_MS,
  initialState,
  type NnState,
  reset,
  setDataset,
  setLr,
  setPlaying,
  setProbe,
  setShow,
  type ShowKey,
  trainEpoch,
} from "./state";
import { createWeights } from "./weights";

/**
 * How long one played epoch — the gradient step, the 1600-point boundary grid and the redraw —
 * may take before the DEV build complains. Ten epochs a second leaves 100 ms a frame; 8 ms is
 * the point past which a played run would start to feel like it is dropping frames.
 */
const EPOCH_BUDGET_MS = 8;

const HINT = {
  storageKey: "ai-lab.hint.nn",
  heading: "How to explore",
  lines: [
    "Press Play and watch the boundary on the floor bend toward the data.",
    "Drag the grey probe across the floor to light up the activations behind its prediction.",
    "Thick struts are big weights; blue is negative.",
  ],
};

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

    const wall = createWall(host.theme, { width: WALL_W, height: WALL_H, opacity: WALL_OPACITY });
    built.push(() => {
      wall.dispose();
    });

    const floor = createFloor(host.theme);
    built.push(() => {
      floor.dispose();
    });

    const points = createPoints(host.theme);
    built.push(() => {
      points.dispose();
    });

    const weights = createWeights(host.theme);
    built.push(() => {
      weights.dispose();
    });

    const neurons = createNeurons(host.theme);
    built.push(() => {
      neurons.dispose();
    });

    const probe = createProbe(host.theme);
    built.push(() => {
      probe.dispose();
    });

    // Before the hint, so the hint is the later sibling and paints on top.
    const labels = createLabelLayer(host.canvasContainer);
    built.push(() => {
      labels.dispose();
    });

    kit.scene.add(wall.group, floor.group, points.group, weights.group, neurons.group, probe.group);

    return { kit, wall, floor, points, weights, neurons, probe, labels, unwind };
  } catch (error) {
    unwind();
    throw error;
  }
}

function mount(host: VizHost): VizInstance {
  const { kit, wall, floor, points, weights, neurons, probe, labels, unwind } = buildScene(
    host,
    prefersReducedMotion(),
  );

  let state: NnState = initialState();
  let dirty = true;
  /** Canvas size in CSS pixels for label projection; the canvas's own size until the shell resizes. */
  let width = 0;
  let height = 0;
  /** Milliseconds accumulated toward the next automatic epoch while playing. */
  let playClock = 0;
  // Declared before `apply` because the panel's handlers can call `apply`
  // while the panel is still being constructed.
  let panel: NnPanel | undefined;

  // Nothing in the scene moves between mounts, so the framing never changes:
  // computed once and reused by Reset view.
  const home: Framing = frameNn();

  function goHome(): void {
    kit.camera.position.set(...home.position);
    kit.controls.target.set(...home.target);
    kit.controls.update();
  }
  goHome();

  // The boundary grid is 1600 forward passes, so it is repainted only when the weights
  // change; dragging the probe or toggling an overlay costs no grid work. The dataset's
  // spheres are likewise rewritten only when the dataset changes.
  let lastParams: Params | null = null;
  let lastDataset: DatasetKey | null = null;

  function apply(next: NnState): void {
    state = next;
    const d = derived(state);

    if (state.params !== lastParams) {
      floor.set(boundaryGrid(state.params));
      // The struts read the weights and nothing else, so they are rebuilt here rather
      // than on every probe move or toggle.
      weights.set(state.params);
      lastParams = state.params;
    }
    if (state.dataset !== lastDataset) {
      points.set(d.dataset);
      lastDataset = state.dataset;
    }
    // Verbatim: `neurons.set` scales the raw input layer itself.
    neurons.set(d.probeActivations);
    probe.set(state.probe);

    weights.setShow(state.show.weights);
    points.setShow(state.show.data);
    floor.setShow(state.show.boundary);
    syncLabels(labels, state, d);

    panel?.render(state, d);
    dirty = true;
  }

  let detachDrag: (() => void) | undefined;
  let hint: UsageHint | undefined;

  try {
    panel = createNnPanel(host.panel, {
      onDataset: (key: DatasetKey) => apply(setDataset(state, key)),
      onStep: () => apply(trainEpoch(state)),
      onPlay: (on: boolean) => apply(setPlaying(state, on)),
      onReset: () => apply(reset(state)),
      onLr: (v: number) => apply(setLr(state, v)),
      onResetView: () => {
        goHome();
        dirty = true;
      },
      onShow: (key: ShowKey, on: boolean) => apply(setShow(state, key, on)),
    });

    hint = createUsageHint(host.canvasContainer, HINT);

    detachDrag = attachDrag({
      canvas: host.renderer.domElement,
      camera: kit.camera,
      controls: kit.controls,
      hitTargets: [probe.hitTarget],
      // The floor is the plane z = 0, so the probe drags across it at 1:1.
      getPlaneZ: () => 0,
      surfaceTarget: floor.mesh,
      // `p` is the world (x, y) of the hit on z = 0; `setProbe` clamps to the domain.
      onDrag: (_index: number, p: Vec2) => {
        // The first move of the probe is proof the hint has been read.
        hint?.hide();
        apply(setProbe(state, inputFromFloor(p)));
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

  return {
    update(dt: number): boolean {
      // Damping keeps the camera moving for a moment after the pointer stops.
      const moved = kit.controls.update(dt);
      if (state.playing) {
        // `dt` is seconds and capped at 0.1 by the loop; EPOCH_MS is milliseconds.
        playClock += dt * 1000;
        while (playClock >= EPOCH_MS) {
          playClock -= EPOCH_MS;
          const started = import.meta.env.DEV ? performance.now() : 0;
          apply(trainEpoch(state));
          if (import.meta.env.DEV) {
            const ms = performance.now() - started;
            if (ms > EPOCH_BUDGET_MS) {
              console.warn(`nn: epoch apply took ${ms.toFixed(1)} ms (budget ${EPOCH_BUDGET_MS})`);
            }
          }
        }
      } else {
        playClock = 0;
      }

      // Labels re-project on every render: the camera, the weights or the canvas size changed.
      if (dirty || moved) {
        const canvas = host.renderer.domElement;
        const w = width || canvas.clientWidth;
        const h = height || canvas.clientHeight;
        labels.update(kit.camera, w, h);
        host.renderer.render(kit.scene, kit.camera);
      }
      const rendered = dirty || moved;
      dirty = false;
      // True while playing too, so the loop never idles out from under the epoch timer.
      return rendered || state.playing;
    },

    resize(w: number, h: number): void {
      width = w;
      height = h;
      kit.camera.aspect = w / h;
      kit.camera.updateProjectionMatrix();
      dirty = true;
    },

    dispose(): void {
      host.theme.removeEventListener("change", onThemeChange);
      detachDrag?.();
      hint?.dispose();
      labels.dispose();
      // Scene objects first, then the panel: DOM teardown is independent of GPU
      // teardown, and this matches the other scenes' order.
      probe.dispose();
      neurons.dispose();
      weights.dispose();
      points.dispose();
      floor.dispose();
      wall.dispose();
      disposeObject(kit.scene);
      kit.dispose();
      panel?.dispose();
    },
  };
}

export const neuralNetwork: Visualization = {
  id: "neural-network",
  topic: "machine-learning",
  title: "Neural network",
  summary:
    "Watch a tiny network learn: layers on a wall with weights as struts, the data and the decision boundary on the floor, one gradient step at a time.",
  status: "ready",
  mount,
};
