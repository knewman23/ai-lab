import type { Graph, GraphNode, Values } from "../../core/math/autograd";
import { localGrad, nodeById } from "../../core/math/autograd";
import type { GraphKey } from "../../core/math/graphs";
import { createEquation } from "../../ui/equation";
import { proseNum } from "../../ui/readout";
import type { BpState, Derived } from "./state";
import type { OverviewSpec } from "../../ui/overview";
import type { ControlInfo } from "../../ui/info";

/** One entry per control, in the panel's order: what it changes, and what to watch. */
export const CONTROL_INFO = {
  graph: {
    what:
      "Swaps the expression being differentiated, and restarts the pass at the beginning with " +
      "that graph's own starting leaves.",
    why:
      "Each one isolates a rule. a·b + c shows that adding passes a gradient through unchanged " +
      "while multiplying hands each input the other's value. L = e·c + e has a node feeding two " +
      "consumers, whose gradient is the sum of what each hands back. The tanh neuron is the " +
      "smallest thing with a product, a sum and a nonlinearity together.",
  },
  leaf: {
    what:
      "A leaf's value: an input the graph is evaluated at, and one of the only numbers here that " +
      "is given rather than computed.",
    why:
      "Move one and every node downstream recomputes, gradients included. These stand in for a " +
      "model's weights — the numbers training is allowed to change — which is why the gradient " +
      "with respect to each one is the number the whole backward pass exists to produce.",
  },
  showValues: {
    what: "Draws each node's forward value as a bar.",
    why:
      "The forward pass in one glance. Bars appear as the pass reveals each node, so it doubles " +
      "as a record of how far the computation has got.",
  },
  showGrads: {
    what: "Draws each node's gradient with respect to the output as a bar.",
    why:
      "This is the answer the backward pass computes: how much the output moves when that node " +
      "does. Watch a shared node's bar arrive in two instalments, one per consumer, since until " +
      "both have run the number shown is a partial sum.",
  },
  showEdgeDerivs: {
    what: "Labels each edge with the local derivative of the node above it with respect to that input.",
    why:
      "These are the factors the chain rule multiplies. A leaf's gradient is the product of the " +
      "labels along the path from it up to the output, which is exactly what the backward pass " +
      "accumulates one edge at a time.",
  },
} as const satisfies Readonly<Record<string, ControlInfo>>;

export const OVERVIEW: OverviewSpec = {
  summary: "How a framework works out which weight to blame for the error",
  objective:
    "Every model is a graph of small operations. The forward pass computes the output; the " +
    "backward pass walks the same graph in reverse, handing each node the derivative of the " +
    "output with respect to it, so every input ends up with its share of the blame.",
  whereUsed:
    "This is what PyTorch's autograd is. The forward pass records a graph of the operations you " +
    "performed, and calling .backward() walks it in reverse applying the chain rule. Every " +
    "gradient that trains every model in the field comes out of a pass like this one.",
  example:
    "A single neuron: two inputs times two weights, summed with a bias, squashed by tanh. That " +
    "is the tanh neuron in the Graph select, and it is the smallest thing containing all the " +
    "parts — a product, a sum and a nonlinearity — which is why the frameworks' own tutorials " +
    "start there too.",
};

/** Each preset's expression, in TeX, for the explanation. */
export const GRAPH_TEX: Readonly<Record<GraphKey, string>> = {
  neuron: "o = \\tanh(x_1 w_1 + x_2 w_2 + b)",
  "product-sum": "d = ab + c",
  "shared-node": "L = ec + e,\\ e = ab + c",
};

const CHAIN_RULE_TEX =
  "\\frac{\\partial L}{\\partial x} = \\frac{\\partial L}{\\partial y}\\cdot\\frac{\\partial y}{\\partial x}";
const LOCAL_RULES_TEX = [
  "\\frac{\\partial(a+b)}{\\partial a} = 1",
  "\\frac{\\partial(ab)}{\\partial a} = b",
  "\\frac{\\partial\\tanh x}{\\partial x} = 1 - \\tanh^2 x",
];

function inputValues(node: GraphNode, values: Values): string[] {
  return node.inputs.map((id) => proseNum(values[id] ?? NaN));
}

/** The op applied to the input values, e.g. "2 × −3" or "tanh(0.8814)". */
function opText(node: GraphNode, values: Values): string {
  const [a = "", b = ""] = inputValues(node, values);
  switch (node.op) {
    case "add":
      return `${a} + ${b}`;
    case "mul":
      return `${a} × ${b}`;
    case "tanh":
      return `tanh(${a})`;
    case "leaf":
      throw new Error(`explanation: leaf "${node.id}" has no forward step`);
  }
}

function forwardText(graph: Graph, id: string, values: Values): string {
  const node = nodeById(graph, id);
  return `forward: ${node.label} = ${opText(node, values)} = ${proseNum(values[id] ?? NaN)}`;
}

function backwardText(graph: Graph, id: string, d: Derived): string {
  const node = nodeById(graph, id);
  const g = proseNum(d.grads[id] ?? NaN);
  const parts = node.inputs.map(
    (input, i) => `${input}.grad += ${proseNum(localGrad(graph, id, i, d.values))} × ${g}`,
  );
  return `backward at ${id}: ${id}.grad = ${g} → ${parts.join(", ")}`;
}

/** The sentence for the step just taken: forward uses the node's label, backward uses node ids. */
export function stepText(d: Derived): string {
  if (d.done) return "Pass complete.";
  if (d.current === null) return "Leaves are given; press Step to run the forward pass.";
  return d.current.kind === "forward"
    ? forwardText(d.graph, d.current.node, d.values)
    : backwardText(d.graph, d.current.node, d);
}

/** The local derivative shown on an edge: "× <∂node/∂input>" at `values`. */
export function edgeLabel(graph: Graph, node: string, inputIndex: number, values: Values): string {
  return `× ${proseNum(localGrad(graph, node, inputIndex, values))}`;
}

/** "Step k of N: <stepText>", the live pass line. */
export function passLine(step: number, d: Derived): string {
  return `Step ${step} of ${d.steps.length}: ${stepText(d)}`;
}

export interface BpExplanation {
  el: HTMLElement;
  render(state: BpState, d: Derived): void;
}

/** The backprop explanation: the chain rule, the three local rules, the graph's expression, the step and the hint. */
export function createExplanation(host: HTMLElement): BpExplanation {
  const el = document.createElement("div");
  el.className = "explain";
  host.append(el);

  const chainRule = createEquation();
  chainRule.set(CHAIN_RULE_TEX);
  el.append(chainRule.el);
  for (const tex of LOCAL_RULES_TEX) {
    const eq = createEquation();
    eq.set(tex);
    el.append(eq.el);
  }

  const graphEquation = createEquation();
  graphEquation.el.classList.add("graph-equation");
  const stepPara = document.createElement("p");
  const hintPara = document.createElement("p");
  hintPara.className = "hint";
  el.append(graphEquation.el, stepPara, hintPara);

  return {
    el,
    render(state: BpState, d: Derived): void {
      graphEquation.set(GRAPH_TEX[state.graph]);
      stepPara.textContent = stepText(d);
      hintPara.textContent = d.graph.hint;
    },
  };
}
