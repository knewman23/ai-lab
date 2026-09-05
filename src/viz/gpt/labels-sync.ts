/**
 * The scene's one HTML overlay: §5.8's five label families — the band names, the sequence's five
 * words, the eight vocabulary words on the floor, the eight bar labels and the three
 * residual-path steps.
 *
 * Every id here is stable across a state change, so a label is rewritten in place rather than
 * rebuilt: only the residual path's three come and go, and only when its toggle moves. The world
 * points are read from the same pure geometry the meshes are drawn from, so a label can never
 * drift off the thing it names.
 */

import { VOCAB } from "../../core/math/transformer";
import type { LabelLayer } from "../shared/labels";
import type { Vec3 } from "../shared/layer";
import { BAR_LIFT, barHeight, barX, peak } from "./bars-geometry";
import { pointPosition } from "./floor-embed-geometry";
import { BAND_Z, type BandKey, columnX, WALL_W } from "./layout";
import { words } from "./panel-controls";
import { PATH_LIFT, pathPoints, STEP_LABELS, STEPS } from "./residual-path-geometry";
import type { Derived, GptState } from "./state";

/** §5.2's band names, which name the stages rather than the state keys the bands are keyed by. */
const BAND_NAMES: Readonly<Record<BandKey, string>> = {
  embed: "embed + position",
  attention: "attention",
  residual: "+ residual",
  mlp: "MLP",
  logits: "logits",
};

const BANDS = Object.keys(BAND_NAMES) as readonly BandKey[];

/** Clear of the wall's right edge, so a band name never sits on the pipeline it names. */
const BAND_DX = 0.35;
/** Toward the camera, matching the lift the band lines themselves are drawn at. */
const WALL_LIFT = -0.02;
/** How far below the wall's bottom edge (z = 0) a token's word hangs. */
const WORD_DROP = 0.28;
/** Clear of a bar's top, so the pill sits above the bar rather than over it. */
const BAR_GAP = 0.1;
/** Clear of a vocabulary sphere, whose centre already stands `POINT_RADIUS` off the floor. */
const POINT_GAP = 0.12;

/** The midpoint of one residual-path step, where its short name sits. */
function midpoint(from: Vec3, to: Vec3): Vec3 {
  return [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, PATH_LIFT];
}

/**
 * Writes every label the current state calls for into `labels`. The residual path's three are
 * removed rather than left behind when its toggle goes off: they are the only family whose
 * presence depends on the state, so they are the only thing this ever takes down.
 */
export function syncLabels(labels: LabelLayer, state: GptState, d: Derived): void {
  for (const band of BANDS) {
    labels.set(
      `band:${band}`,
      BAND_NAMES[band],
      [WALL_W / 2 + BAND_DX, WALL_LIFT, BAND_Z[band]],
      "node",
    );
  }

  words(state.sentence).forEach((word, i) => {
    labels.set(`word:${i}`, word, [columnX(i), WALL_LIFT, -WORD_DROP], "node");
  });

  const max = peak(d.probabilities);
  VOCAB.forEach((word, v) => {
    const e = state.embeddings[v];
    const p = d.probabilities[v];
    if (e === undefined || p === undefined) throw new Error(`gpt labels: no word ${v}`);
    const [px, py, pz] = pointPosition(e);
    labels.set(`vocab:${v}`, word, [px, py, pz + POINT_GAP], "node");
    labels.set(
      `bar:${v}`,
      word,
      [barX(v), BAR_LIFT, BAND_Z.logits + barHeight(p, max) + BAR_GAP],
      "node",
    );
  });

  if (!state.residualPath) {
    for (const step of STEPS) labels.remove(`step:${step}`);
    return;
  }
  const path = pathPoints(d.pass, state.query);
  STEPS.forEach((step, s) => {
    const from = path[s];
    const to = path[s + 1];
    const name = STEP_LABELS[s];
    if (from === undefined || to === undefined || name === undefined) {
      throw new Error(`gpt labels: the residual path has no step ${s}`);
    }
    labels.set(`step:${step}`, name, midpoint(from, to), "edge");
  });
}
