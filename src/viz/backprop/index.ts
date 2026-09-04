import { Vector3 } from "three";
import type { GraphKey } from "../../core/math/graphs";
import type { Vec2 } from "../../core/math/numeric";
import { createSceneKit, disposeObject, prefersReducedMotion } from "../../core/scene";
import { attachDrag } from "../shared/drag";
import type { Framing } from "../shared/framing";
import { createUsageHint, type UsageHint } from "../shared/hint";
import { createLabelLayer } from "../shared/labels";
import { createWall } from "../shared/wall";
import type { Visualization, VizHost, VizInstance } from "../types";
import { createBars, type SetCause } from "./bars";
import { S_VALUE, BAR_DX } from "./bars-geometry";
import { createEdges } from "./edges";
import { frameWall } from "./frame-wall";
import { syncLabels } from "./labels-sync";
import { layoutGraph, type Positions, WALL_H, WALL_OPACITY, WALL_W, wallPoint } from "./layout";
import { createNodes } from "./nodes";
import { createBpPanel, type BpPanel } from "./panel";
import {
  type BpState,
  derived,
  initialState,
  reset,
  resetPass,
  setGraph,
  setLeaf,
  setPlaying,
  setShow,
  type ShowKey,
  STEP_MS,
  stepForward,
} from "./state";

const HINT = {
  storageKey: "ai-lab.hint.backprop",
  heading: "How to explore",
  lines: [
    "Press Step to run the forward pass, then keep stepping through the backward pass.",
    "Drag a leaf's bar or move its slider; every revealed number updates.",
    "Orbit to read the bars: value on the left of each node, gradient on the right; a bar pointing at you is positive.",
  ],
};

/**
 * The drag plane's normal, reused across pointerdowns. drag.ts calls `normal(i)`
 * then `getOffset(i)` and copies the vector, so one scratch Vector3 serves both.
 */
const NORMAL = new Vector3();

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

    const edges = createEdges(host.theme);
    built.push(() => {
      edges.dispose();
    });

    const nodes = createNodes(host.theme);
    built.push(() => {
      nodes.dispose();
    });

    const bars = createBars(host.theme, reducedMotion);
    built.push(() => {
      bars.dispose();
    });

    // Before the hint, so the hint is the later sibling and paints on top.
    const labels = createLabelLayer(host.canvasContainer);
    built.push(() => {
      labels.dispose();
    });

    kit.scene.add(wall.group, edges.group, nodes.group, bars.group);

    return { kit, wall, edges, nodes, bars, labels, unwind };
  } catch (error) {
    unwind();
    throw error;
  }
}

function mount(host: VizHost): VizInstance {
  const { kit, wall, edges, nodes, bars, labels, unwind } = buildScene(
    host,
    prefersReducedMotion(),
  );

  let state: BpState = initialState();
  let dirty = true;
  /** Canvas size in CSS pixels for label projection; the canvas's own size until the shell resizes. */
  let width = 0;
  let height = 0;
  /** Milliseconds accumulated toward the next automatic step while playing. */
  let playClock = 0;
  // Declared before `apply` because the panel's handlers can call `apply`
  // while the panel is still being constructed.
  let panel: BpPanel | undefined;

  // The wall never moves, so the framing never changes: computed once and reused by Reset view.
  const home: Framing = frameWall();

  function goHome(): void {
    kit.camera.position.set(...home.position);
    kit.controls.target.set(...home.target);
    kit.controls.update();
  }
  goHome();

  // The layout depends only on the graph, so it is recomputed only when the graph
  // changes; the first `apply` below lays out the initial graph.
  let positions: Positions = {};
  let laidOut: GraphKey | null = null;

  function apply(next: BpState, cause: SetCause = "step"): void {
    state = next;
    const d = derived(state);

    if (state.graph !== laidOut) {
      positions = layoutGraph(d.graph);
      laidOut = state.graph;
      edges.set(d.graph, positions);
      // Labels are keyed by node id; the old graph's ids would otherwise linger.
      labels.clear();
    }
    edges.setActive(d.graph, positions, d.current?.node ?? null);
    nodes.set(d.graph, positions, d.revealed.values);
    bars.set(d.graph, positions, d.values, d.grads, d.revealed, state.show, cause);
    syncLabels(labels, d, positions, state.show);

    panel?.render(state, d);
    dirty = true;
  }

  let detachDrag: (() => void) | undefined;
  let hint: UsageHint | undefined;

  try {
    panel = createBpPanel(host.panel, {
      onGraph: (key: GraphKey) => apply(setGraph(state, key)),
      onStep: () => apply(stepForward(state)),
      onPlay: (on: boolean) => apply(setPlaying(state, on)),
      onResetPass: () => apply(resetPass(state)),
      onLeaf: (id: string, v: number) => apply(setLeaf(state, id, v), "edit"),
      onReset: () => apply(reset(state)),
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
      hitTargets: bars.hitTargets,
      // The plane holds the leaf's value-bar axis and faces the camera, so pointer
      // motion maps to bar length at roughly 1:1 from any orbit.
      plane: {
        normal: (index: number) => {
          // Parked pool boxes sit on another layer, so an undefined id cannot occur;
          // the guard keeps a stray hit from throwing inside the pointer handler.
          const id = bars.leafIds[index];
          if (id === undefined) return NORMAL;
          const [x, , z] = wallPoint(positions, id);
          return NORMAL.set(
            kit.camera.position.x - (x - BAR_DX),
            0,
            kit.camera.position.z - z,
          ).normalize();
        },
        getOffset: (index: number) => {
          const id = bars.leafIds[index];
          if (id === undefined) return 0;
          const [x, , z] = wallPoint(positions, id);
          return NORMAL.x * (x - BAR_DX) + NORMAL.z * z;
        },
      },
      // p[1] is the hit's world y; positive values point toward −y. setLeaf clamps.
      onDrag: (index: number, p: Vec2) => {
        // The first move of a bar is proof the hint has been read.
        const id = bars.leafIds[index];
        if (id === undefined) return;
        hint?.hide();
        apply(setLeaf(state, id, -p[1] / S_VALUE), "edit");
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

  // Instant: the leaves are given, not revealed by a step, so the first frame
  // is complete and the loop can idle until the visitor acts.
  apply(state, "edit");

  return {
    update(dt: number): boolean {
      // Damping keeps the camera moving for a moment after the pointer stops.
      const moved = kit.controls.update(dt);
      if (state.playing) {
        playClock += dt * 1000;
        if (playClock >= STEP_MS) {
          playClock -= STEP_MS;
          apply(stepForward(state));
        }
      } else {
        playClock = 0;
      }
      const easing = bars.update(dt * 1000);

      // Labels re-project on every render: the camera, a bar length or the canvas size changed.
      if (dirty || moved || easing) {
        const canvas = host.renderer.domElement;
        const w = width || canvas.clientWidth;
        const h = height || canvas.clientHeight;
        labels.update(kit.camera, w, h);
        host.renderer.render(kit.scene, kit.camera);
      }
      const rendered = dirty || moved || easing;
      dirty = false;
      // True while playing too, so the loop never idles out from under the step timer.
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
      bars.dispose();
      nodes.dispose();
      edges.dispose();
      wall.dispose();
      disposeObject(kit.scene);
      kit.dispose();
      panel?.dispose();
    },
  };
}

export const backpropGraph: Visualization = {
  id: "backprop-graph",
  topic: "machine-learning",
  title: "Backprop graph",
  summary:
    "Step through the forward and backward passes of a small autograd graph: values fill in, then gradients flow back along every edge with the local derivative written on it.",
  status: "ready",
  mount,
};
