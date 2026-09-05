import type { Vec2 } from "../../core/math/numeric";
import { type Forward, probabilities, SEQUENCES } from "../../core/math/transformer";
import { prefersReducedMotion } from "../../core/scene";
import { attachDrag } from "../shared/drag";
import type { Framing } from "../shared/framing";
import { createUsageHint, type UsageHint } from "../shared/hint";
import type { Visualization, VizHost, VizInstance } from "../types";
import { createColumnPick } from "./column-pick";
import { frameGpt } from "./frame-gpt";
import { syncLabels } from "./labels-sync";
import { embedFromFloor } from "./layout";
import { createGptPanel, type GptPanel } from "./panel";
import { buildScene } from "./scene-build";
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
 * Which fields of the state `forward` takes as input. Everything marked false changes only what
 * is drawn or how the pass is read, and must not cost a second pass.
 *
 * Every field is named, not just the four that matter, and the `Record<keyof GptState, …>` is
 * the point: a field added to `GptState` and left unclassified stops this object compiling.
 * Without that, a new input would silently join the false half by omission and the scene would
 * quietly stop recomputing — a mistake nothing at runtime would report, since the DEV budget
 * warning only fires for recomputing too *much*.
 */
const FEEDS_FORWARD: Readonly<Record<keyof GptState, boolean>> = {
  embeddings: true,
  sentence: true,
  positional: true,
  causal: true,
  preset: false,
  query: false,
  head: false,
  stage: false,
  temperature: false,
  residualPath: false,
};

const PASS_INPUTS = Object.keys(FEEDS_FORWARD).filter(
  (key) => FEEDS_FORWARD[key as keyof GptState],
) as readonly (keyof GptState)[];

/** Whether anything `forward` reads has moved between two states. */
function forwardInputsMoved(a: GptState, b: GptState): boolean {
  return PASS_INPUTS.some((key) => a[key] !== b[key]);
}

function mount(host: VizHost): VizInstance {
  const { kit, floor, bands, columns, arcs, bars, path, hits, labels, unwind } = buildScene(
    host,
    prefersReducedMotion(),
  );

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

    // Both mechanisms hear pointerdown in the capture phase and neither stops propagation, so
    // where a floor sphere projects over a column's pick volume one press arms both. That is
    // harmless: a press that ends as a click never moved a word, and a press that ends as a
    // drag has travelled too far to still read as a click, so at most one of them ever fires.
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
      // The camera, the state or the canvas size changed.
      const rendered = dirty || moved;
      // Labels re-project on every render, so they never lag the orbit.
      if (rendered) {
        const canvas = host.renderer.domElement;
        const w = width || canvas.clientWidth;
        const h = height || canvas.clientHeight;
        labels.update(kit.camera, w, h);
        host.renderer.render(kit.scene, kit.camera);
      }
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
      // `unwind` already runs every teardown in reverse of the order it built them, overlay
      // and pick volumes included, so a second list here would only be one to forget to
      // extend. Scene objects first, then the panel: DOM teardown is independent of GPU
      // teardown, and this matches the other scenes' order.
      unwind();
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
