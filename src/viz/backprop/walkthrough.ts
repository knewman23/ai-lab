/**
 * The backprop scene's walkthrough: six steps built only from `state.ts`'s setters.
 *
 * The pass steps are taken by calling `stepForward` rather than by setting `step` directly, so a
 * replay lands exactly where pressing Step that many times lands, and stays right if the pass
 * order ever changes.
 *
 * The prose says what to do and what will happen rather than what is on screen, because every
 * control stays live and the scene may not look how the step left it.
 */

import type { Step } from "../shared/walkthrough";
import type { BpControlId } from "./panel";
import { setGraph, setShow, stepForward, type BpState } from "./state";

export const BP_WALKTHROUGH_TITLE = "Walk me through it";

const advance = (s: BpState, times: number): BpState => {
  let next = s;
  for (let i = 0; i < times; i += 1) next = stepForward(next);
  return next;
};

/** `a·b + c` takes two forward steps and two backward ones; the shared graph takes eight. */
const FORWARD_FIRST = 1;
const FORWARD_ALL = 2;
const FIRST_BACKWARD = 3;
const WHOLE_PASS = 4;
const SHARED_PASS = 8;

export const BP_STEPS: readonly Step<BpState, BpControlId>[] = [
  {
    prose:
      "The leftmost column holds the leaves: the numbers this graph is evaluated at, and the " +
      "only things here that are given rather than computed. Every other node sits one column " +
      "further right than the deepest input feeding it, so the graph reads left to right. Drag " +
      "a leaf slider and everything downstream recomputes.",
    enter: (s) => setGraph(s, "product-sum"),
    focus: "leaves",
  },
  {
    prose:
      "Press Step to evaluate one node. The forward pass takes them in an order where a node's " +
      "inputs are always ready before the node itself, which for a·b + c means the product is " +
      "computed before the sum that uses it.",
    enter: (s) => advance(setGraph(s, "product-sum"), FORWARD_FIRST),
    focus: "step",
  },
  {
    prose:
      "One more press finishes the forward pass and the top node holds the output. That single " +
      "number is what the backward pass differentiates: every gradient the scene reports answers " +
      "the question of how much this output moves when one input does.",
    enter: (s) => advance(setGraph(s, "product-sum"), FORWARD_ALL),
    focus: "step",
  },
  {
    prose:
      "Keep pressing and the pass turns around. The output's gradient with respect to itself is " +
      "1, and each backward step hands a node's gradient to its inputs multiplied by the local " +
      "derivative of that node's operation — which is the chain rule applied one edge at a time.",
    enter: (s) => advance(setGraph(s, "product-sum"), FIRST_BACKWARD),
    focus: "step",
  },
  {
    prose:
      "Turn the edge derivatives on to read those local factors on the edges themselves. Adding " +
      "passes a gradient through unchanged to both inputs; multiplying hands each input the " +
      "other one's value. A leaf's gradient is the product of the factors along the path back " +
      "to the output.",
    enter: (s) => setShow(advance(setGraph(s, "product-sum"), WHOLE_PASS), "edgeDerivs", true),
    focus: "showEdgeDerivs",
  },
  {
    prose:
      "Switch to L = e·c + e, where e feeds two consumers. Step through it and e's gradient " +
      "arrives in two instalments — one from each consumer — and is the sum of them, which is " +
      "the multivariable chain rule. Until both have run the number shown is a partial sum, " +
      "which is exactly what a framework accumulating into .grad is doing.",
    enter: (s) => setShow(advance(setGraph(s, "shared-node"), SHARED_PASS), "grads", true),
    focus: "graph",
  },
];
