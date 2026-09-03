import { FNS } from "../../core/math/functions1d";
import { createEquation } from "../../ui/equation";
import { fmt } from "../../ui/readout";
import type { DxState, derived } from "./state";

export interface DxExplanation {
  el: HTMLElement;
  render(state: DxState, d: ReturnType<typeof derived>): void;
}

type Derived = ReturnType<typeof derived>;

/** Readout and prose text for f′(x), which is a number only where the function is differentiable. */
export function derivativeText(d: Derived["d"]): string {
  if (d.kind === "jump") return `undefined: left ${fmt(d.left)}, right ${fmt(d.right)}`;
  if (d.kind === "vertical") return "∞ (vertical tangent)";
  return fmt(d.v);
}

/** Prose spells numbers with a typographic minus; the readouts keep `fmt`'s plain hyphen. */
function prose(n: number): string {
  return fmt(n).replace("-", "\u2212");
}

function tangentText(state: DxState, d: Derived["d"]): string {
  if (d.kind === "jump") {
    return `At x = ${fmt(state.x)} the left and right slopes differ (${prose(d.left)} and ${prose(d.right)}), so no tangent line is drawn.`;
  }
  if (d.kind === "vertical") {
    return `At x = ${fmt(state.x)} the tangent is vertical, so f′(${fmt(state.x)}) is undefined.`;
  }
  return `At x = ${fmt(state.x)}, f′(x) = ${fmt(d.v)}, the slope of the blue line.`;
}

function secantSentence(d: Derived): string {
  if (d.d.kind === "jump") {
    return "Right-hand secants all have slope 1 while the curve to the left has slope −1, so no single line fits: |x| has no derivative at 0.";
  }
  if (d.d.kind === "vertical") {
    return "The secant slopes grow without bound as h shrinks, so the tangent is vertical and f′(0) is undefined.";
  }
  if (d.hEff === null || d.secant === null || d.gap === null) {
    return "x is at the right edge of the domain, so there is no secant.";
  }
  return `With h = ${fmt(d.hEff)}, the secant slope is ${fmt(d.secant)}, off by ${fmt(d.gap)}. Shrink h and the grey line rotates onto the blue one.`;
}

/** The derivative explorer explanation: the limit, the secant's error, and the lower curve. */
export function createExplanation(): DxExplanation {
  const el = document.createElement("div");
  el.className = "explain";

  const limitEquation = createEquation();
  limitEquation.set("f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}");
  const fnEquation = createEquation();
  const tangentSentence = document.createElement("p");
  el.append(limitEquation.el, fnEquation.el, tangentSentence);

  const secantPara = document.createElement("p");
  el.append(secantPara);

  const primeEquation = createEquation();
  const lowerSentence = document.createElement("p");
  el.append(primeEquation.el, lowerSentence);

  function render(state: DxState, d: Derived): void {
    const fn = FNS[state.fn];

    fnEquation.set(`f(x) = ${fn.tex}`);
    tangentSentence.textContent = tangentText(state, d.d);

    secantPara.textContent = secantSentence(d);

    primeEquation.set(`f'(x) = ${fn.texPrime}`);
    const zoomed =
      state.zoom > 0
        ? ` Zoomed ×${String(d.K)}: the curve is nearly its tangent, which is what differentiable means.`
        : "";
    lowerSentence.textContent = `The height of the lower marker is the slope of the upper tangent. ${fn.hint}${zoomed}`;
  }

  return { el, render };
}
