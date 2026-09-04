export type Op = "leaf" | "add" | "mul" | "tanh";

/** One node of a scalar computation graph; leaves have `op: "leaf"` and no inputs. */
export interface GraphNode {
  readonly id: string;
  readonly label: string;
  readonly op: Op;
  readonly inputs: readonly string[];
}

/** A leaf's starting value and slider range. */
export interface Leaf {
  readonly id: string;
  readonly start: number;
  readonly range: readonly [number, number];
}

/** A preset computation graph. `key` is a plain string here; graphs.ts narrows it to GraphKey. */
export interface Graph {
  readonly key: string;
  readonly title: string;
  readonly nodes: readonly GraphNode[];
  readonly output: string;
  readonly leaves: readonly Leaf[];
  /** "What to look for" sentence shown in the explanation panel. */
  readonly hint: string;
}

/** Node id → value (or gradient). */
export type Values = Readonly<Record<string, number>>;

/** One step of the animated pass: a non-leaf node's forward evaluation or its backward distribution. */
export type PassStep =
  | { readonly kind: "forward"; readonly node: string }
  | { readonly kind: "backward"; readonly node: string };

function nodeById(g: Graph, id: string): GraphNode {
  const n = g.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`autograd: unknown node "${id}" in graph "${g.key}"`);
  return n;
}

/** Leaf id → its starting value. */
export function starts(g: Graph): Values {
  return Object.fromEntries(g.leaves.map((leaf) => [leaf.id, leaf.start]));
}

/** DFS post-order from the output, visiting inputs in order (the notebook's build_topo): inputs before consumers, output last. */
export function topoOrder(g: Graph): readonly string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const input of nodeById(g, id).inputs) visit(input);
    order.push(id);
  };
  visit(g.output);
  return order;
}

/** Non-leaf node ids in topo order. */
function nonLeaves(g: Graph): readonly string[] {
  return topoOrder(g).filter((id) => nodeById(g, id).op !== "leaf");
}

/** Every node's value given the leaves' values. */
export function forward(g: Graph, leaves: Values): Values {
  const values: Record<string, number> = { ...leaves };
  for (const id of nonLeaves(g)) {
    const node = nodeById(g, id);
    const [x0 = NaN, x1 = NaN] = node.inputs.map((input) => values[input] ?? NaN);
    switch (node.op) {
      case "add":
        values[id] = x0 + x1;
        break;
      case "mul":
        values[id] = x0 * x1;
        break;
      case "tanh":
        values[id] = Math.tanh(x0);
        break;
    }
  }
  return values;
}

/** ∂node/∂inputs[inputIndex] at `values`: add → 1; mul → the other input's value; tanh → 1 − out². */
export function localGrad(g: Graph, node: string, inputIndex: number, values: Values): number {
  const n = nodeById(g, node);
  switch (n.op) {
    case "add":
      return 1;
    case "mul": {
      const other = n.inputs[1 - inputIndex];
      return other === undefined ? NaN : (values[other] ?? NaN);
    }
    case "tanh": {
      const out = values[node] ?? NaN;
      return 1 - out * out;
    }
    case "leaf":
      throw new Error(`autograd: leaf "${node}" has no local gradient`);
  }
}

/**
 * Gradients after the first k backward steps. The output's step sets its grad to 1; each step
 * then does grads[input] += localGrad · grads[node]. A key exists only once a contribution has
 * landed, so k = 0 gives {} and a shared node shows its partial sum until every consumer has run.
 */
export function gradsAfter(g: Graph, values: Values, k: number): Values {
  const grads: Record<string, number> = {};
  const order = [...nonLeaves(g)].reverse();
  for (const id of order.slice(0, k)) {
    if (id === g.output) grads[id] = 1;
    const upstream = grads[id] ?? 0;
    nodeById(g, id).inputs.forEach((input, i) => {
      grads[input] = (grads[input] ?? 0) + localGrad(g, id, i, values) * upstream;
    });
  }
  return grads;
}

/** Every node's gradient: `gradsAfter` with every backward step run. */
export function backward(g: Graph, values: Values): Values {
  return gradsAfter(g, values, nonLeaves(g).length);
}

/** Forward steps for the non-leaves in topo order, then backward steps in reverse topo order. */
export function passSteps(g: Graph): readonly PassStep[] {
  const ids = nonLeaves(g);
  return [
    ...ids.map((node): PassStep => ({ kind: "forward", node })),
    ...[...ids].reverse().map((node): PassStep => ({ kind: "backward", node })),
  ];
}

/** Which values are known after the first `stepIndex` steps (leaves always), and how many backward steps have run. */
export function revealed(
  g: Graph,
  stepIndex: number,
): { readonly values: ReadonlySet<string>; readonly backwardSteps: number } {
  const values = new Set(g.leaves.map((leaf) => leaf.id));
  let backwardSteps = 0;
  for (const step of passSteps(g).slice(0, stepIndex)) {
    if (step.kind === "forward") values.add(step.node);
    else backwardSteps++;
  }
  return { values, backwardSteps };
}
