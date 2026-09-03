import type { Eigen } from "../../core/math/matrix2";
import { createEquation } from "../../ui/equation";
import { fmt } from "../../ui/readout";
import type { MtState, derived } from "./state";

export interface MtExplanation {
  el: HTMLElement;
  render(state: MtState, d: ReturnType<typeof derived>): void;
}

/** An eigenvalue this close to zero collapses its direction onto the origin. */
const ZERO_EIGENVALUE = 1e-6;

function swatch(variant: "accent" | "ink", label: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const dot = document.createElement("span");
  dot.className = `swatch ${variant}`;
  dot.setAttribute("aria-hidden", "true");
  frag.append(dot, document.createTextNode(` ${label}`));
  return frag;
}

function orientationSentence(orientation: ReturnType<typeof derived>["orientation"]): string {
  if (orientation === "reversed") {
    return "The determinant is negative, so the plane is flipped over: orientation is reversed.";
  }
  if (orientation === "collapsed") {
    return "The determinant is zero, so the square collapses onto a line and all area is lost.";
  }
  return "Areas are scaled by that factor, and orientation is preserved.";
}

function eigenSentence(e: Eigen): string {
  if (e.kind === "complex") {
    return "A rotation component turns every direction, so no real direction is left in place.";
  }
  if (e.kind === "uniform") {
    return "Every direction is an eigenvector: the whole plane is scaled by the same factor.";
  }
  if (e.pairs.length === 1) {
    return "One direction is only stretched, not turned; every other direction is bent towards it.";
  }
  const collapsed = e.pairs.some((p) => Math.abs(p.value) < ZERO_EIGENVALUE);
  if (collapsed) {
    return "One eigenvalue is 0: every vector along that eigenvector is sent to the origin, so the plane collapses onto the other eigen line.";
  }
  return "Two directions are only stretched, not turned; each is drawn as a line through the origin.";
}

/** The matrix transformation explanation: columns, determinant and eigenvectors. */
export function createExplanation(): MtExplanation {
  const el = document.createElement("div");
  el.className = "explain";

  const columnsPara = document.createElement("p");
  columnsPara.textContent = "The columns of M are where î and ĵ land.";
  const matrixEquation = createEquation();
  const legend = document.createElement("p");
  legend.className = "legend";
  legend.append(swatch("accent", "î"), document.createTextNode("  "), swatch("ink", "ĵ"));
  el.append(columnsPara, matrixEquation.el, legend);

  const detPara = document.createElement("p");
  detPara.textContent =
    "The determinant is the area scale factor, and its sign is the orientation.";
  const detEquation = createEquation();
  const detSentence = document.createElement("p");
  el.append(detPara, detEquation.el, detSentence);

  const eigenPara = document.createElement("p");
  eigenPara.textContent = "Eigenvectors are the directions M only stretches.";
  const eigenEquation = createEquation();
  eigenEquation.set("M\\mathbf v = \\lambda \\mathbf v");
  const eigenSentenceEl = document.createElement("p");
  el.append(eigenPara, eigenEquation.el, eigenSentenceEl);

  function render(state: MtState, d: ReturnType<typeof derived>): void {
    const [a, b, c, dd] = state.m;
    matrixEquation.set(
      `M = \\begin{pmatrix} ${fmt(a, 3)} & ${fmt(b, 3)} \\\\ ${fmt(c, 3)} & ${fmt(dd, 3)} \\end{pmatrix}`,
    );
    detEquation.set(`\\det M = ad - bc = ${fmt(d.detM)}`);

    const partial =
      state.t < 1
        ? " While Animate is below 1, the readout shows det M(t), the partially applied matrix."
        : "";
    detSentence.textContent = `${orientationSentence(d.orientation)}${partial}`;
    eigenSentenceEl.textContent = eigenSentence(d.eigen);
  }

  return { el, render };
}
