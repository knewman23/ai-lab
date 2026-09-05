/**
 * The derivative explorer's walkthrough: six steps built only from `state.ts`'s setters.
 *
 * The prose says what to do and what will happen rather than what is on screen, because every
 * control stays live and the scene may not look how the step left it.
 */

import type { Step } from "../shared/walkthrough";
import type { DxControlId } from "./panel";
import { H_RANGE, setFn, setH, setShow, setX, zoomIn, type DxState } from "./state";

export const DX_WALKTHROUGH_TITLE = "Walk me through it";

/** Zoom presses in the last step: each narrows the window by four, so three is 64×. */
const ZOOM_PRESSES = 3;

const zoomTimes = (s: DxState, times: number): DxState => {
  let next = s;
  for (let i = 0; i < times; i += 1) next = zoomIn(next);
  return next;
};

export const DX_STEPS: readonly Step<DxState, DxControlId>[] = [
  {
    prose:
      "The curve is one function of a single variable, and the Function select swaps which one. " +
      "Everything else in this scene is measured at one point on it: the height there, the slope " +
      "there, and how well a straight line through two nearby points approximates that slope.",
    enter: (s) => setFn(s, "square"),
    focus: "fn",
  },
  {
    prose:
      "Drag the point along the curve. The tangent line pivots to match the slope where it lands, " +
      "and the f′(x) readout is that slope as a number: negative on the way down, zero at the " +
      "bottom, positive on the way up. Press Reset to put it back at the start.",
    enter: (s) => setX(s, -1.4),
    focus: "reset",
  },
  {
    prose:
      "The secant line joins the point to another one h along the curve, and its slope is the " +
      "average rate of change between them. Drag h down and the secant rotates onto the tangent: " +
      "the Secant − f′ readout is the gap between the two, and it shrinks towards zero as h does.",
    // h at its maximum: the widest gap the slider allows, so shrinking it is worth doing.
    enter: (s) => setH(setX(s, -1.4), H_RANGE[1]),
    focus: "h",
  },
  {
    prose:
      "Turn the derivative curve on to read the slope as a height in the band underneath. On " +
      "x³ − 3x the top curve levels off twice, and the lower curve crosses zero at exactly those " +
      "two places; where the top curve falls steeply, the lower one sits well below its centre.",
    enter: (s) => setShow(setFn(s, "cubic"), "derivative", true),
    focus: "showDerivative",
  },
  {
    prose:
      "Switch to |x| and drag the point to the corner at x = 0. Approaching from the left the " +
      "slope is −1 and from the right it is +1, and the two do not agree, so no tangent line is " +
      "drawn there and the readout reports the derivative as undefined. Continuous is not the " +
      "same as differentiable, and this is where the difference shows.",
    enter: (s) => setX(setFn(s, "abs"), 0),
    focus: "fn",
  },
  {
    prose:
      "Go back to a smooth function and press Zoom in. Each press narrows the window by four, so " +
      "three presses is sixty-four times closer, and the curve and its tangent become impossible " +
      "to tell apart. That is what differentiability buys: close enough in, a smooth curve is its " +
      "own tangent line. Reset zoom to move the point again.",
    // h small as well, so the secant sits on the tangent rather than reaching far outside
    // a window this narrow.
    enter: (s) => zoomTimes(setH(setX(setFn(s, "sine"), 1), 0.01), ZOOM_PRESSES),
    focus: "zoomIn",
  },
];
