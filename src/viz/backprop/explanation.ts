import type { Graph, GraphNode, Values } from "../../core/math/autograd";
import { localGrad, nodeById } from "../../core/math/autograd";
import type { GraphKey } from "../../core/math/graphs";
import { createEquation } from "../../ui/equation";
import { proseNum } from "../../ui/readout";
import type { BpState, Derived } from "./state";

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
      return a;
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
