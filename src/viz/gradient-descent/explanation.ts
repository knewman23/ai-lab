import { OPTIMIZERS } from "../../core/math/optimizers";
import { SURFACES } from "../../core/math/surfaces";
import { createEquation } from "../../ui/equation";
import { fmt } from "../../ui/readout";
import type { OverviewSpec } from "../../ui/overview";
import type { GdState, derived } from "./state";

/**
 * The panel's opening framing. The house-price case is the one every course opens with, and the
 * last sentence is the honest half of it: with four attributes the normal equation solves the
 * thing outright. Gradient descent earns its keep on the models that are too big for that, which
 * is why the paragraph before it names those instead.
 */
export const OVERVIEW: OverviewSpec = {
  summary: "Finding the numbers that make a model wrong as rarely as possible",
  objective:
    "Fitting a model means choosing weights that make its mistakes small. Gradient descent does " +
    "the choosing from two ingredients: a measure of the error, and the slope of that error " +
    "where it stands. Step downhill, repeat.",
  whereUsed:
    "Almost everything trained rather than programmed: image recognition, fraud detection, the " +
    "recommender that ranks a feed, and the transformers behind chat assistants, where this loop " +
    "runs for weeks across billions of weights.",
  example:
    "House prices: give floor area, bedrooms and age each a weight, and the error is the average " +
    "squared gap between the price those weights predict and what each house sold for. Those " +
    "weights are this surface's axes and the height is that error. With three attributes you " +
    "would solve it outright — gradient descent is for the models too big for that.",
};

export interface Explanation {
  el: HTMLElement;
  render(state: GdState, d: ReturnType<typeof derived>): void;
}

/** The "what you're seeing" panel: static framing plus live gradient and update-rule equations. */
export function createExplanation(): Explanation {
  const el = document.createElement("div");
  el.className = "explain";

  const intro = document.createElement("p");
  intro.textContent =
    "The surface is the loss as a function of two parameters, x and y. The ball is the current parameter vector; its height is the loss at that point. Drag the ball, or click anywhere on the surface, to start from a different point.";
  el.append(intro);

  const gradHeading = document.createElement("h3");
  gradHeading.className = "lbl";
  gradHeading.textContent = "The gradient";
  const gradEquation = createEquation();
  gradEquation.set(
    "\\nabla f(x,y) = \\left(\\frac{\\partial f}{\\partial x}, \\frac{\\partial f}{\\partial y}\\right)",
  );
  const gradCode = document.createElement("code");
  gradCode.className = "readout-inline";
  const gradSentence = document.createElement("p");
  gradSentence.textContent =
    "The arrow points uphill, in the direction of steepest increase; the optimizer steps the other way.";
  el.append(gradHeading, gradEquation.el, gradCode, gradSentence);

  const updateHeading = document.createElement("h3");
  updateHeading.className = "lbl";
  updateHeading.textContent = "The update";
  const updateEquation = createEquation();
  const hint = document.createElement("p");
  hint.className = "hint";
  el.append(updateHeading, updateEquation.el, hint);

  function render(state: GdState, d: ReturnType<typeof derived>): void {
    const [gx, gy] = d.grad;
    gradCode.textContent = `∇f = (${fmt(gx)}, ${fmt(gy)}), |∇f| = ${fmt(d.gradMag)}`;

    updateEquation.set(OPTIMIZERS[state.optimizer].equation(state.lr));
    hint.textContent = SURFACES[state.surface].hint;
  }

  return { el, render };
}
