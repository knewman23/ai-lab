import type { Eigen } from "../../core/math/matrix2";
import { createEquation } from "../../ui/equation";
import { fmt } from "../../ui/readout";
import type { MtState, derived } from "./state";
import type { OverviewSpec } from "../../ui/overview";
import type { ControlInfo } from "../../ui/info";

/** One entry per control, in the panel's order: what it changes, and what to watch. */
export const CONTROL_INFO = {
  preset: {
    what: "Loads a matrix worth looking at, and writes its four numbers into the boxes below.",
    why:
      "Each one isolates a property. Reflection has determinant −1: the same area, orientation " +
      "reversed. Projection has determinant 0, which flattens the plane onto a line and cannot be " +
      "undone. Rotation has no real eigenvector at all, because every direction turns.",
  },
  matrix: {
    what:
      "The matrix itself, as four numbers. The left column is where the first basis vector lands " +
      "and the right column is where the second one lands; entries are held within ±3.",
    why:
      "A 2×2 matrix is nothing more than those two destinations, which is why dragging a basis " +
      "vector in the scene and typing here do the same thing. Everything the panel reports is " +
      "computed from these four numbers.",
  },
  animate: {
    what:
      "Slides the transformation between the identity at 0 and the full matrix at 1, blending " +
      "the two linearly.",
    why:
      "It shows the transformation as a motion rather than a jump, which makes a flip visible as " +
      "the moment the plane passes through being flat. The vectors are only draggable at 1, " +
      "since anywhere else you would be dragging a partially applied matrix.",
  },
  showGrid: {
    what: "Draws where the whole grid of the plane goes, not just the unit square.",
    why:
      "Linear means the grid stays a grid: lines stay straight, parallel lines stay parallel, " +
      "and the origin stays put. Everything a matrix can do to the plane is visible in what " +
      "happens to those lines.",
  },
  showEigen: {
    what: "Draws the directions the matrix does not turn, when it has any.",
    why:
      "A vector along one of these comes out pointing the same way, scaled by its eigenvalue. " +
      "Rotations have none — the readout says complex pair — which is the geometric meaning of " +
      "the characteristic polynomial having no real roots.",
  },
  showGhost: {
    what: "Keeps the original unit square in view alongside the transformed one.",
    why:
      "It is what makes the determinant readable: the area of the new shape against the area of " +
      "the old one, with a sign for whether the plane was turned over.",
  },
} as const satisfies Readonly<Record<string, ControlInfo>>;

export const OVERVIEW: OverviewSpec = {
  summary: "What a matrix does to space, read off the two columns it is made of",
  objective:
    "A matrix is a linear transformation: it sends every point somewhere, and knowing where the " +
    "two basis vectors land tells you where everything else lands. Determinant, eigenvectors and " +
    "orientation are all read off those two columns.",
  whereUsed:
    "Every frame a game renders: the graphics pipeline multiplies 4x4 matrices together to " +
    "place, rotate and scale what is on screen. Robotics uses them to track where an arm's " +
    "gripper is and which way it points; photo editors use them to warp images and correct lens " +
    "distortion.",
  example:
    "Rotating a photograph by ten degrees is one matrix applied to every pixel coordinate. Its " +
    "determinant is 1, which is why no area is gained or lost in the process. A matrix with " +
    "determinant 0 flattens the picture onto a line and cannot be undone — which is what happens " +
    "here the moment the two columns point the same way.",
};

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
