/**
 * The gradient descent scene's walkthrough: six steps built only from `state.ts`'s reducers.
 *
 * Every stepping step calls `state.step` rather than reimplementing the update, so the trail a
 * replay leaves is the trail pressing Step that many times leaves — by construction rather than
 * by coincidence, and it stays that way when the optimizers or the domain checks change.
 *
 * `step` pushes onto the path buffer in place, which is deliberate (`state.ts:18-28`). Replay is
 * unaffected: `goTo` folds from `initialState()`, whose `freshPath` allocates, so each fold
 * pushes into a buffer created during that same fold.
 */

import type { Step } from "../shared/walkthrough";
import type { GdControlId } from "./panel";
import { drag, setOptimizer, setShow, setSurface, step, type GdState } from "./state";

export const GD_WALKTHROUGH_TITLE = "Walk me through it";

/** Presses of Step each stepping step performs. */
const BOWL_STEPS = 6;
const RAVINE_STEPS = 12;
const VALLEY_STEPS = 80;

/** Where step 2 places the ball: off-centre in the bowl, so the gradient is large and readable. */
const BOWL_START: readonly [number, number] = [-2.2, 1.4];

const advance = (s: GdState, times: number): GdState => {
  let next = s;
  for (let i = 0; i < times; i += 1) next = step(next);
  return next;
};

export const GD_STEPS: readonly Step<GdState, GdControlId>[] = [
  {
    prose:
      "The surface is one loss over two parameters, x and y: height is the loss at that point, " +
      "and the rings drawn on the plane beneath it are its contours, the lines along which the " +
      "loss does not change. The Surface select swaps the function under everything else in this " +
      "panel, so every later step can be tried again on a harder shape.",
    enter: (s) => setSurface(s, "bowl"),
    focus: "surface",
  },
  {
    prose:
      "Drag the ball, or click anywhere on the surface, to start the run from a different point. " +
      "The arrow leaving the ball is the gradient: it points in the direction of steepest " +
      "increase, so the optimizer will step the opposite way, and the readout's |∇f| is how " +
      "steep the climb is there. Moving the ball clears the trail and starts a fresh run.",
    enter: (s) => drag(s, [BOWL_START[0], BOWL_START[1]]),
    focus: "reset",
  },
  {
    prose:
      "Turn the tangent plane on. It is the surface's best flat approximation at the ball, and " +
      "it is the only thing the gradient knows: the update below uses the slope of this plane " +
      "and nothing about the curvature around it. Drag the ball into a bend and the plane " +
      "follows, matching the surface at one point and leaving it everywhere else.",
    enter: (s) => setShow(s, "tangent", true),
    focus: "showTangent",
  },
  {
    prose:
      "Press Step to take one update: the parameters move against the gradient by the learning " +
      "rate, and the new point joins the trail behind the ball. Hold Run to take them at ten a " +
      "second. On a round bowl every step points near the centre, so the trail runs almost " +
      "straight in and the steps shorten as the slope flattens.",
    enter: (s) => advance(s, BOWL_STEPS),
    focus: "step",
  },
  {
    prose:
      "The elongated bowl is the same idea with one axis ten times steeper. At its default rate " +
      "SGD's narrow axis flips sign on every step — the trail crosses the valley rather than " +
      "running down it — while the wide axis shrinks by a fifth each time. Switch the Optimizer " +
      "to adam and press Step again from the same point: it scales each parameter by its own " +
      "recent gradient size, so both axes move at about the same rate and the crossing stops.",
    enter: (s) => advance(setOptimizer(setSurface(s, "elongated"), "sgd"), RAVINE_STEPS),
    focus: "optimizer",
  },
  {
    prose:
      "Rosenbrock's gradients run two orders of magnitude larger than the bowl's, which is why " +
      "this surface starts a hundred times slower. From here the run drops into the narrow " +
      "valley within a few steps and then crawls along its curved floor, which is the whole " +
      "difficulty of the shape. Nudge the learning rate up towards 0.005 and press Step: within " +
      "a few presses the update overshoots the valley wall entirely, the ball parks at the edge " +
      "of the surface and the status reads that it left the domain.",
    enter: (s) => advance(setOptimizer(setSurface(s, "rosenbrock"), "sgd"), VALLEY_STEPS),
    focus: "lr",
  },
];
