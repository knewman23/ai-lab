import { OPTIMIZERS } from "../../core/math/optimizers";
import { SURFACES } from "../../core/math/surfaces";
import { createEquation } from "../../ui/equation";
import { fmt } from "../../ui/readout";
import type { OverviewSpec } from "../../ui/overview";
import type { GdState, derived } from "./state";
import type { ControlInfo } from "../../ui/info";

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

/**
 * One entry per control the panel offers, in the panel's own order. `what` says what the control
 * changes; `why` says what to watch, and where a number came from when there is one.
 */
export const CONTROL_INFO = {
  surface: {
    what:
      "Swaps the loss function the whole scene is drawn from. Its height is the error at each " +
      "pair of parameters, and every other control acts on whichever one is chosen.",
    why:
      "Each shape is a different difficulty. The bowl is the easy case every optimizer solves; " +
      "the elongated bowl is ten times steeper across than along, which is what makes SGD " +
      "zigzag; Rosenbrock adds a curved valley that no single direction stays right for.",
  },
  optimizer: {
    what:
      "Chooses the rule that turns the gradient into a step. SGD steps straight down it; " +
      "momentum accumulates a velocity; Adam scales each parameter by its own recent gradient.",
    why:
      "It is the clearest thing to compare on the elongated bowl. At the default rate SGD's " +
      "narrow axis flips sign on every step while Adam moves both axes at about the same pace, " +
      "because dividing by a running gradient size removes the difference in scale.",
  },
  lr: {
    what:
      "How far each step moves. SGD multiplies the gradient by it, so the step grows with the " +
      "slope; Adam's step is close to this value per parameter whatever the slope is.",
    why:
      "The single setting most likely to break a run. Too small and it crawls; too large and it " +
      "overshoots the valley and leaves the domain, which the status line will tell you. Each " +
      "surface opens at a rate that suits it — Rosenbrock's is a hundred times smaller than the " +
      "bowl's, because its gradients are two orders of magnitude larger.",
  },
  showTangent: {
    what: "Draws the plane that touches the surface at the ball and matches its slope there.",
    why:
      "It is the only thing the gradient actually knows. The step is chosen from this flat " +
      "approximation and nothing about the curvature around it, which is why a rate that works " +
      "on the bowl can overshoot on a valley floor.",
  },
  showContours: {
    what: "Draws lines of equal loss on the plane beneath the surface.",
    why:
      "The gradient always crosses them at a right angle, so where they bunch together the " +
      "surface is steep and the steps are long. On the elongated bowl they are stretched " +
      "ellipses, which is the same fact as the zigzag, seen from above.",
  },
  showPath: {
    what: "Draws every position the run has visited since the last reset, newest brightest.",
    why:
      "The trail is the argument: a straight run in on the bowl, a crossing zigzag on the " +
      "elongated one, and a quick drop into Rosenbrock's valley followed by a long crawl along " +
      "its floor.",
  },
} as const satisfies Readonly<Record<string, ControlInfo>>;

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
