import { FNS } from "../../core/math/functions1d";
import { createEquation } from "../../ui/equation";
import { fmt, proseNum } from "../../ui/readout";
import type { DxState, derived } from "./state";
import type { OverviewSpec } from "../../ui/overview";
import type { ControlInfo } from "../../ui/info";

/** One entry per control, in the panel's order: what it changes, and what to watch. */
export const CONTROL_INFO = {
  fn: {
    what:
      "Swaps the curve. Everything else in the scene is measured on whichever one is chosen, and " +
      "the point returns to that function's own starting x.",
    why:
      "Two of them are here to fail on purpose. |x| has a corner where the left and right slopes " +
      "disagree, so no tangent exists at x = 0; the square root of |x| has a vertical tangent " +
      "there instead. Continuous is not the same as differentiable, and those two are the proof.",
  },
  h: {
    what:
      "The gap between the point and the second point the secant line is drawn through. The " +
      "secant's slope is the average rate of change across that gap.",
    why:
      "Shrinking it is the whole definition of a derivative: the Secant − f′ readout is the gap " +
      "between the average rate and the instantaneous one, and it goes to zero as h does. Near " +
      "the right-hand edge h is clipped so the second point stays on the curve, and the panel " +
      "says so when that happens.",
  },
  showTangent: {
    what: "Draws the line through the point whose slope is the derivative there.",
    why:
      "It is the line the secant is converging on. At a corner or a vertical tangent none is " +
      "drawn at all, which is the scene's way of saying the derivative does not exist there.",
  },
  showSecant: {
    what: "Draws the line through the point and the one h further along the curve.",
    why:
      "The tangent is the limit of this line and nothing more. Watching it rotate onto the " +
      "tangent as h shrinks is the argument the definition makes in symbols.",
  },
  showDerivative: {
    what: "Draws f′ as a curve of its own in the band beneath the main one.",
    why:
      "It turns the slope into a height you can read along the whole domain at once. Where the " +
      "top curve levels off the lower one crosses zero; where the top falls steeply the lower one " +
      "sits well below its centre line. Values too large for the band are clamped into it.",
  },
} as const satisfies Readonly<Record<string, ControlInfo>>;

export const OVERVIEW: OverviewSpec = {
  summary: "Reading how fast something is changing at a single instant",
  objective:
    "A derivative is the slope of a curve at one point: the rate something changes right now, " +
    "rather than on average across an interval. The whole trick is that a close enough view " +
    "makes a smooth curve indistinguishable from that one straight line.",
  whereUsed:
    "Speed read off a position trace, and stopping distance read off speed; how fast a drug's " +
    "concentration falls in the bloodstream, which sets how often a dose is repeated; marginal " +
    "cost, the price of making one more unit, which is where a production line stops.",
  example:
    "A car's position is logged every second. Its average speed over the last minute says little " +
    "about the moment the brakes went on — the derivative at that instant is the number a crash " +
    "investigator wants. One curve, two questions: a line through two points answers the first, " +
    "the tangent at a single point answers the second.",
};

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

function tangentText(state: DxState, d: Derived["d"]): string {
  if (d.kind === "jump") {
    return `At x = ${fmt(state.x)} the left and right slopes differ (${proseNum(d.left)} and ${proseNum(d.right)}), so no tangent line is drawn.`;
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
