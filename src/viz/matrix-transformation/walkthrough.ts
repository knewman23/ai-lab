/**
 * The matrix transformation scene's walkthrough: six steps built only from `state.ts`'s setters.
 *
 * The prose says what to do and what will happen rather than what is on screen, because every
 * control stays live and the scene may not look how the step left it.
 */

import type { Vec2 } from "../../core/math/numeric";
import type { Step } from "../shared/walkthrough";
import type { MtControlId } from "./panel";
import { dragBasis, setPreset, setShow, type MtState } from "./state";

export const MT_WALKTHROUGH_TITLE = "Walk me through it";

/** Where step 2 drags the first basis vector: off both axes, so the square really shears over. */
const DRAGGED_E1: Vec2 = [1.6, 0.9];

export const MT_STEPS: readonly Step<MtState, MtControlId>[] = [
  {
    prose:
      "The shaded square is the unit square, spanned by the two basis vectors, and the matrix " +
      "starts as the identity: it sends every vector to itself. The Preset select loads a matrix " +
      "worth looking at, and the four boxes underneath are its entries.",
    enter: (s) => setPreset(s, "identity"),
    focus: "preset",
  },
  {
    prose:
      "Drag the tip of either basis vector. A 2×2 matrix is nothing but the two places the basis " +
      "vectors land, so moving one rewrites that column of the matrix and the square becomes a " +
      "parallelogram. Everything else in the scene is read off those two columns.",
    enter: (s) => dragBasis(s, 0, DRAGGED_E1),
    focus: "matrix",
  },
  {
    prose:
      "Turn the ghost on to keep the original square in view. The determinant is the signed area " +
      "of the parallelogram the unit square becomes, so the Area readout is its size and the " +
      "determinant carries a sign as well: drag a vector until the two columns line up and the " +
      "area goes to zero, because the square has been flattened onto a line.",
    enter: (s) => setShow(dragBasis(s, 0, DRAGGED_E1), "ghost", true),
    focus: "showGhost",
  },
  {
    prose:
      "Load Reflection across x. Its determinant is −1: the same area as the unit square, with " +
      "the sign flipped, and the fill changes to mark it. A negative determinant means the plane " +
      "has been turned over — the shortest way from the first basis vector to the second now " +
      "goes the other way round.",
    enter: (s) => setPreset(s, "reflection"),
    focus: "preset",
  },
  {
    prose:
      "Load Scale and turn the eigenvectors on. They mark the directions the matrix does not " +
      "turn: a vector along one of them comes out pointing the same way, only longer or shorter, " +
      "and its eigenvalue is that factor — 2 along one axis and 0.5 along the other here.",
    enter: (s) => setShow(setPreset(s, "scale"), "eigen", true),
    focus: "showEigen",
  },
  {
    prose:
      "Now load Rotation 45°. Its determinant is 1, so area and orientation both survive, but no " +
      "direction does: every vector turns, and the eigenvalue readout reports a complex pair " +
      "rather than any line on the plane. Try the other presets from here and read the two " +
      "numbers against what the square does.",
    enter: (s) => setShow(setPreset(s, "rotation"), "eigen", true),
    focus: "preset",
  },
];
