import { Group } from "three";
import type { Vec2 } from "../../core/math/numeric";
import { type Forward, probabilities, SEQUENCES } from "../../core/math/transformer";
import { createSceneKit, disposeObject, prefersReducedMotion } from "../../core/scene";
import { attachDrag } from "../shared/drag";
import type { Framing } from "../shared/framing";
import { createUsageHint, type UsageHint } from "../shared/hint";
import { createLabelLayer } from "../shared/labels";
import { createWall } from "../shared/wall";
import type { Visualization, VizHost, VizInstance } from "../types";
import { createArcs } from "./arcs";
import { createBars } from "./bars";
import { createColumnHits, createColumnPick } from "./column-pick";
import { createColumns } from "./columns";
import { createFloorEmbed } from "./floor-embed";
import { frameGpt } from "./frame-gpt";
import { syncLabels } from "./labels-sync";
import { embedFromFloor, WALL_H, WALL_OPACITY, WALL_W } from "./layout";
import { createGptPanel, type GptPanel } from "./panel";
import { createResidualPath } from "./residual-path";
import { createWallBands } from "./wall-bands";
import {
  type Derived,
  type GptState,
  initialState,
  pass,
  resetEmbeddings,
  setCausal,
  setEmbedding,
  setHead,
  setPositional,
  setPreset,
  setQuery,
  setResidualPath,
  setSentence,
  setStage,
  setTemperature,
} from "./state";

/**
 * How long one `apply` — the forward pass, the softmax and the whole redraw — may take before the
 * DEV build complains. §1.7 promises a drag lands within one frame; 4 ms leaves the rest of a
 * 60 Hz budget to the renderer.
 */
const APPLY_BUDGET_MS = 4;

const HINT = {
  storageKey: "ai-lab.hint.gpt",
  heading: "How to explore",
  lines: [
    "Drag a word across the floor and watch its probability bar answer.",
    "Click a token column on the wall to see which words that token reads.",
    "Switch the embeddings to collapsed to strip the meaning out and leave only position.",
  ],
};

/**
 * Builds the scene-side objects. If any one of them throws, the ones already built are disposed
 * in reverse order before the error is rethrown, so a half-finished mount never leaks GPU
 * resources. The returned `unwind` lets the caller do the same for a failure later in the mount.
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

    const floor = createFloorEmbed(host.theme);
    built.push(() => {
      floor.dispose();
    });

    const bands = createWallBands(host.theme);
    built.push(() => {
      bands.dispose();
    });

    const columns = createColumns(host.theme);
    built.push(() => {
      columns.dispose();
    });

    const arcs = createArcs(host.theme);
    built.push(() => {
      arcs.dispose();
    });

    const bars = createBars(host.theme);
    built.push(() => {
      bars.dispose();
    });

    const path = createResidualPath(host.theme);
    built.push(() => {
      path.dispose();
    });

    // The column pick volumes get a group of their own rather than joining the columns': the
    // drag raycasts the floor recursively for click-to-place, and an invisible box anywhere
    // under a raycast surface swallows the hit it was meant to find.
    const hits = createColumnHits();
    const hitGroup = new Group();
    hitGroup.add(...hits.targets);
    built.push(() => {
      hitGroup.removeFromParent();
      hitGroup.clear();
      hits.dispose();
    });

    // Before the hint, so the hint is the later sibling and paints on top.
    const labels = createLabelLayer(host.canvasContainer);
    built.push(() => {
      labels.dispose();
    });

    kit.scene.add(
      wall.group,
      floor.group,
      bands.group,
      columns.group,
      arcs.group,
      bars.group,
      path.group,
      hitGroup,
    );

    return { kit, wall, floor, bands, columns, arcs, bars, path, hits, hitGroup, labels, unwind };
  } catch (error) {
    unwind();
    throw error;
  }
}

/**
 * Whether the four inputs `forward` takes have moved. Everything else in the state — the query,
 * the head, the focused stage, the temperature and the residual-path toggle — changes only what
 * is drawn or how the pass is read, so it must not cost a second pass.
 */
function forwardInputsMoved(a: GptState, b: GptState): boolean {
  return (
    a.embeddings !== b.embeddings ||
    a.sentence !== b.sentence ||
    a.positional !== b.positional ||
    a.causal !== b.causal
  );
}

function mount(host: VizHost): VizInstance {
  const { kit, wall, floor, bands, columns, arcs, bars, path, hits, hitGroup, labels, unwind } =
    buildScene(host, prefersReducedMotion());

  let state: GptState = initialState();
  let dirty = true;
  /** Canvas size in CSS pixels for label projection; the canvas's own size until the shell resizes. */
  let width = 0;
  let height = 0;
  /** The pass the scene is drawing, kept across the state changes that cannot have moved it. */
  let cached: Forward | null = null;
  // Declared before `apply` because the panel's handlers can call `apply`
  // while the panel is still being constructed.
  let panel: GptPanel | undefined;

  // Nothing in the scene moves between mounts, so the framing never changes:
  // computed once and reused by Reset view.
  const home: Framing = frameGpt();

  function goHome(): void {
    kit.camera.position.set(...home.position);
    kit.controls.target.set(...home.target);
    kit.controls.update();
  }
  goHome();

  function apply(next: GptState): void {
    const started = import.meta.env.DEV ? performance.now() : 0;
    if (cached === null || forwardInputsMoved(state, next)) cached = pass(next);
    state = next;
    const d: Derived = {
      sequence: SEQUENCES[state.sentence],
      pass: cached,
      probabilities: probabilities(cached.logits, state.temperature),
    };

    columns.set(d.pass);
    columns.setQuery(state.query);
    arcs.set(d.pass, state.query, state.head);
    bars.set(d.probabilities);
    floor.set(state.embeddings, d.probabilities);
    path.set(d.pass, state.query);
    path.setShow(state.residualPath);

    // The whole of the stage focus: every other unit reads `bandForStage` for itself.
    bands.setFocus(state.stage);
    arcs.setFocus(state.stage);

    syncLabels(labels, state, d);
    // Rendered on every apply, so the query select follows a click on a column as §6.3 asks.
    panel?.render(state, d);
    dirty = true;

    if (import.meta.env.DEV) {
      const ms = performance.now() - started;
      if (ms > APPLY_BUDGET_MS) {
        console.warn(`gpt: apply took ${ms.toFixed(1)} ms (budget ${APPLY_BUDGET_MS})`);
      }
    }
  }

  let detachDrag: (() => void) | undefined;
  let detachPick: (() => void) | undefined;
  let hint: UsageHint | undefined;

  try {
    panel = createGptPanel(host.panel, {
      onSentence: (key) => {
        // The sentence's length is fixed at five, so the query survives the change.
        apply(setSentence(state, key));
      },
      onPreset: (key) => apply(setPreset(state, key)),
      onResetEmbeddings: () => apply(resetEmbeddings(state)),
      onQuery: (position: number) => apply(setQuery(state, position)),
      onHead: (key) => apply(setHead(state, key)),
      onStage: (key) => apply(setStage(state, key)),
      onTemperature: (t: number) => apply(setTemperature(state, t)),
      onPositional: (on: boolean) => apply(setPositional(state, on)),
      onCausal: (on: boolean) => apply(setCausal(state, on)),
      onResidualPath: (on: boolean) => apply(setResidualPath(state, on)),
      onResetView: () => {
        goHome();
        dirty = true;
      },
    });

    hint = createUsageHint(host.canvasContainer, HINT);

    detachDrag = attachDrag({
      canvas: host.renderer.domElement,
      camera: kit.camera,
      controls: kit.controls,
      hitTargets: floor.hitTargets,
      // The floor is the plane z = 0, so a word drags across it at 1:1.
      getPlaneZ: () => 0,
      // No `surfaceTarget`: that arm exists to place a point where the floor was clicked, and
      // every word already stands on this floor. Without one, `attachDrag` never reports -1,
      // so the index below is always one of the eight words.
      // `p` is the world (x, y) of the hit on z = 0; `embedFromFloor` clamps to the domain.
      onDrag: (index: number, p: Vec2) => {
        if (index < 0) throw new Error("gpt: the floor drag has no surface arm to place from");
        // The first move of a word is proof the hint has been read.
        hint?.hide();
        apply(setEmbedding(state, index, embedFromFloor(p)));
      },
    });

    detachPick = createColumnPick({
      canvas: host.renderer.domElement,
      camera: kit.camera,
      targets: hits.targets,
      onSelect: (index: number) => {
        hint?.hide();
        apply(setQuery(state, index));
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
      // Labels re-project on every render: the camera, the state or the canvas size changed.
      if (dirty || moved) {
        const canvas = host.renderer.domElement;
        const w = width || canvas.clientWidth;
        const h = height || canvas.clientHeight;
        labels.update(kit.camera, w, h);
        host.renderer.render(kit.scene, kit.camera);
      }
      const rendered = dirty || moved;
      dirty = false;
      return rendered;
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
      detachPick?.();
      detachDrag?.();
      hint?.dispose();
      labels.dispose();
      // Scene objects first, then the panel: DOM teardown is independent of GPU
      // teardown, and this matches the other scenes' order.
      hitGroup.removeFromParent();
      hitGroup.clear();
      hits.dispose();
      path.dispose();
      bars.dispose();
      arcs.dispose();
      columns.dispose();
      bands.dispose();
      floor.dispose();
      wall.dispose();
      disposeObject(kit.scene);
      kit.dispose();
      panel?.dispose();
    },
  };
}

export const gptTransformer: Visualization = {
  id: "gpt-transformer",
  topic: "machine-learning",
  title: "GPT transformer",
  summary:
    "Drag eight word embeddings across the floor and watch one transformer block respond: attention arcs between the tokens, the residual stream, and the probability of every next word.",
  status: "ready",
  mount,
};
