import { OPTIMIZERS } from "../../core/math/optimizers";
import { SURFACES } from "../../core/math/surfaces";
import { createEquation } from "../../ui/equation";
import { fmt } from "../../ui/readout";
import type { GdState, derived } from "./state";

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
    "The surface is the loss as a function of two parameters, x and y. The ball is the current parameter vector; its height is the loss at that point.";
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
