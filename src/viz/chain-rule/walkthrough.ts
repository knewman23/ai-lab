/**
 * The chain rule scene's walkthrough: six steps built only from `state.ts`'s setters.
 *
 * The prose says what to do and what will happen rather than what is on screen, because every
 * control stays live and the scene may not look how the step left it.
 */

import type { Step } from "../shared/walkthrough";
import type { ChainControlId } from "./panel";
import { setComp, setDx, setShow, setX, type ChainState } from "./state";

export const CHAIN_WALKTHROUGH_TITLE = "Walk me through it";

/** Where step 2 puts x: inside the domain with room for the widest Δx to the right of it. */
const X_AT = 0.6;
/** The wide step the middle of the script works at, and the narrow one it ends at. */
const WIDE_DX = 1;
const NARROW_DX = 0.02;

export const CHAIN_STEPS: readonly Step<ChainState, ChainControlId>[] = [
  {
    prose:
      "Three graphs share one corner. The floor carries u as a function of x, the side wall " +
      "carries y as a function of u, and the back wall carries the composition y(x) directly. " +
      "The Composition select swaps all three at once, since they are three views of one chain.",
    enter: (s) => setComp(s, "sin3x"),
    focus: "comp",
  },
  {
    prose:
      "Drag the point along x. The inner function answers first: a step of Δx along the floor " +
      "produces a step of Δu, and the readouts report both. Press Reset to return x and the step " +
      "size to where they started.",
    enter: (s) => setX(s, X_AT),
    focus: "reset",
  },
  {
    prose:
      "Turn the connectors on. They carry the same Δu from the floor's graph up to the side " +
      "wall's, which is the whole trick of the chain rule: the output of the inner function is " +
      "the input of the outer one, so one leg is shared between two right-angled triangles.",
    enter: (s) => setShow(setX(s, X_AT), "connectors", true),
    focus: "showConnectors",
  },
  {
    prose:
      "Turn the Δ triangles on to see both of them at once. On the floor the legs are Δx and Δu; " +
      "on the side wall they are that same Δu and the Δy it produces; on the back wall the single " +
      "triangle has legs Δx and Δy. Read the ratios in the panel and multiply the first two: the " +
      "product is the third, exactly, for any step size.",
    enter: (s) =>
      setShow(setShow(setDx(setX(s, X_AT), WIDE_DX), "triangles", true), "secants", true),
    focus: "showTriangles",
  },
  {
    prose:
      "Switch to sin x², whose inner function is a parabola rather than a straight line, and drag " +
      "the step size down. On sin 3x the floor's ratio was already exactly 3 at every step, " +
      "because a straight line has the same slope over any interval; on a curved inner function " +
      "it is not, and shrinking Δx is what brings Δu/Δx towards du/dx.",
    enter: (s) => setDx(setX(setComp(s, "sinsq"), X_AT), NARROW_DX),
    focus: "dx",
  },
  {
    prose:
      "Turn the tangents on to draw those two derivatives as lines. The chain rule is the " +
      "statement that survives the shrinking: dy/dx = dy/du · du/dx. Try the other compositions " +
      "from here — the numbers change while the shape of the argument does not.",
    enter: (s) => setShow(setDx(setX(setComp(s, "sinsq"), X_AT), NARROW_DX), "tangents", true),
    focus: "showTangents",
  },
];
