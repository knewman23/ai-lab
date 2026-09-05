import { createEquation } from "../../ui/equation";
import { fmt, proseNum } from "../../ui/readout";
import type { ChainState, Derived } from "./state";
import type { OverviewSpec } from "../../ui/overview";
import type { ControlInfo } from "../../ui/info";

/** One entry per control, in the panel's order: what it changes, and what to watch. */
export const CONTROL_INFO = {
  comp: {
    what:
      "Swaps all three graphs at once, since they are three views of one chain: the inner " +
      "function on one wall, the outer one on the other, and the composition on the floor.",
    why:
      "Worth trying sin 3x against sin x². The first has a straight line as its inner function, " +
      "so Δu/Δx is exactly 3 at every step size and shrinking the step demonstrates nothing on " +
      "that wall. The second is a parabola, where the ratio genuinely has something to converge " +
      "to.",
  },
  dx: {
    what:
      "The step taken along x. It produces a Δu on the inner function, which produces a Δy on " +
      "the outer one, and the panel reports all three ratios.",
    why:
      "The two ratios multiply to the third exactly, at every step size — that part is algebra, " +
      "not a limit. What shrinking the step changes is what each ratio is close to: du/dx and " +
      "dy/du at the point itself. Near the right-hand edge the step is clipped so x + Δx stays " +
      "in the domain.",
  },
  showTriangles: {
    what: "Draws the right-angled triangle on each face whose legs are that face's two changes.",
    why:
      "They are the chain rule made of three pictures: one leg — Δu — is shared between the " +
      "first two triangles, which is exactly why the ratios multiply.",
  },
  showSecants: {
    what: "Draws the line through the two points each triangle spans.",
    why:
      "Each secant's slope is the ratio printed beside it, so the lines are the numbers in the " +
      "panel drawn on the graphs.",
  },
  showTangents: {
    what: "Draws the true derivative at the point on each face.",
    why:
      "The line every secant is heading towards. Turn both on and shrink the step to watch the " +
      "gap close on all three faces at once.",
  },
  showConnectors: {
    what: "Draws the links carrying the inner function's output across to the outer function's input.",
    why:
      "They are the reason this is one chain rather than two unrelated graphs: the Δu leaving one " +
      "wall is the same Δu arriving at the other.",
  },
} as const satisfies Readonly<Record<string, ControlInfo>>;

export const OVERVIEW: OverviewSpec = {
  summary: "Rates that reach their answer through something else on the way",
  objective:
    "When x moves u and u moves y, the chain rule says the two rates multiply: dy/dx is dy/du " +
    "times du/dx. It is how a rate of change survives being routed through an intermediate " +
    "quantity you were not given directly.",
  whereUsed:
    "Training every neural network: backpropagation is this rule applied once per layer, from " +
    "the loss back to each weight. Also any system where a change propagates — temperature moves " +
    "pressure, pressure moves volume — and every related-rates problem in engineering.",
  example:
    "A balloon is inflated at a known number of litres per second and you want to know how fast " +
    "its radius is growing. Volume depends on radius, radius depends on time, and the rate you " +
    "want is neither of the ones you were handed. Multiplying the two links gives it, which is " +
    "the same move backpropagation makes thousands of times per training step.",
};

/** The three prose sentences shown under the equations. */
export interface ChainText {
  rule: string;
  finite: string;
  hint: string;
}

export interface ChainExplanation {
  el: HTMLElement;
  render(state: ChainState, d: Derived): void;
}

/** Readout text for a derivative; "undefined" where it is not a finite number. */
export function derivativeText(v: number): string {
  return Number.isFinite(v) ? fmt(v) : "undefined";
}

function ruleText(state: ChainState, d: Derived): string {
  return (
    `At x = ${proseNum(state.x)}: g′(x) = ${proseNum(d.dg)} on the front wall, ` +
    `f′(u) = ${proseNum(d.df)} on the side wall, so the floor slope is ` +
    `${proseNum(d.dg)} × ${proseNum(d.df)} = ${proseNum(d.dydx)}.`
  );
}

function finiteText(d: Derived): string {
  if (d.dxEff === null || d.deltas === null) {
    return "Move x left of the edge to see the triangles.";
  }
  const { duDx, dyDu, dyDx } = d.deltas;
  const lead = `With Δx = ${proseNum(d.dxEff)}: `;
  if (dyDu === null) {
    return `${lead}Δu is 0 here, so the middle ratio is undefined, but Δy is 0 too and Δy/Δx = 0.`;
  }
  return (
    `${lead}${proseNum(duDx)} × ${proseNum(dyDu)} = ${proseNum(dyDx)}. ` +
    "The Δu leg is the same height on both walls; the Δy leg is the same depth on the side wall " +
    "and the floor. Shrink Δx and each ratio becomes its derivative."
  );
}

/** The explanation's sentences at a state: the product of slopes, the finite ratios, and the preset's hint. */
export function chainText(state: ChainState, d: Derived): ChainText {
  return { rule: ruleText(state, d), finite: finiteText(d), hint: d.comp.hint };
}

/** The chain rule explanation: the rule, the preset's pieces, and the finite-difference version. */
export function createExplanation(host: HTMLElement): ChainExplanation {
  const el = document.createElement("div");
  el.className = "explain";
  host.append(el);

  const ruleEquation = createEquation();
  ruleEquation.set("\\frac{dy}{dx} = \\frac{dy}{du}\\cdot\\frac{du}{dx}");
  const compEquation = createEquation();
  const gEquation = createEquation();
  const fEquation = createEquation();
  const primeEquation = createEquation();
  const rulePara = document.createElement("p");
  el.append(
    ruleEquation.el,
    compEquation.el,
    gEquation.el,
    fEquation.el,
    primeEquation.el,
    rulePara,
  );

  const finiteEquation = createEquation();
  finiteEquation.set(
    "\\frac{\\Delta y}{\\Delta x} = \\frac{\\Delta y}{\\Delta u}\\cdot\\frac{\\Delta u}{\\Delta x}",
  );
  const finitePara = document.createElement("p");
  const hintPara = document.createElement("p");
  hintPara.className = "hint";
  el.append(finiteEquation.el, finitePara, hintPara);

  function render(state: ChainState, d: Derived): void {
    const { comp } = d;
    compEquation.set(`y = ${comp.tex}`);
    gEquation.set(`u = ${comp.texG}`);
    fEquation.set(`y = ${comp.texF}`);
    primeEquation.set(`\\frac{dy}{dx} = ${comp.texPrime}`);

    const text = chainText(state, d);
    rulePara.textContent = text.rule;
    finitePara.textContent = text.finite;
    hintPara.textContent = text.hint;
  }

  return { el, render };
}
