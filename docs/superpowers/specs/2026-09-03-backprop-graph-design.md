# Backprop graph — the notebook-01 autograd DAG with stepped forward and backward passes

Date: 2026-09-03
Status: draft (revision 1)
Parent: [AI Lab design](2026-09-03-ai-lab-design.md); siblings: [Chain rule graph](2026-09-03-chain-rule-graph-design.md), [Gradient descent](2026-09-03-ai-lab-design.md)
Registry: replaces the `machine-learning` roadmap entry `backprop-graph`
Source material: `ai-frontier/notebooks/01-derivatives-and-the-numerical-gradient.ipynb` (the `Value`
class with `+`, `*`, `tanh`, topological `backward`; the single-neuron example)

## 1. Purpose

Make backpropagation a thing you can watch: the small expression graph from notebook 01 laid out on
a wall, a forward pass that fills values in node by node, then a backward pass that pushes gradients
back edge by edge with the local derivative written on each edge. Each node carries two bars that
stick out of the wall, value and gradient, so magnitudes are read in depth and the graph is read
face-on. Leaf values can be changed at any point and every revealed value and gradient recomputes,
so "what happens to the gradients if w1 is bigger" is a drag, not a rerun.

Success criteria: two clicks from the home page; 60 fps while orbiting or dragging; the neuron
preset reproduces the notebook's numbers (o = 0.7071, x1.grad = −1.5, w1.grad = 1.0, x2.grad =
0.5, w2.grad = 0, b.grad = 0.5) to display precision; the `shared-node` preset shows a gradient
accumulating from two paths; a full forward + backward pass on the neuron takes 10 steps; labels stay
attached to their nodes while orbiting.

Out of scope: user-built graphs, training or optimizer steps (the neural network scene), operations
beyond `+`, `×`, `tanh`, more than one output node, graph editing.

## 2. Decisions

| Question | Decision | Alternatives |
|---|---|---|
| Content | Notebook 01's neuron and two smaller fixed expressions; stepped forward then backward | Build-your-own graph; tiny MLP training loop |
| 3D | DAG on a vertical wall (y = 0); value and gradient as bars along ±y through the wall; sign is which side of the wall | Two stacked planes; flat graph with 3D styling |
| Labels | HTML overlay (`viz/shared/labels.ts`): spans projected from world points every frame the camera moves; theme via CSS | Sprite textures; TextGeometry (heavy, not themeable) |
| Editing leaves | Drag a leaf's value bar along its depth axis, or use the per-leaf sliders in the panel; both update the same state | Sliders only; click-to-select then one slider |
| Animation | Discrete steps (Step button / Play at 700 ms per step); bar growth eased over 300 ms unless reduced motion | Continuous scrubbing; a single Play with no stepping |

## 3. Graph model (`core/math/autograd.ts`, pure, unit-tested)

```ts
export type Op = "leaf" | "add" | "mul" | "tanh";
export interface GraphNode { readonly id: string; readonly label: string; readonly op: Op; readonly inputs: readonly string[] }
export interface Graph { readonly key: GraphKey; readonly title: string; readonly nodes: readonly GraphNode[]; readonly output: string;
  readonly leaves: readonly { id: string; start: number; range: readonly [number, number] }[]; readonly hint: string }
export type Values = Readonly<Record<string, number>>;
export function topoOrder(g: Graph): readonly string[];            // leaves first, output last; deterministic (input order, then declaration order)
export function forward(g: Graph, leaves: Values): Values;         // every node's value
export function localGrad(g: Graph, node: string, inputIndex: number, values: Values): number; // add → 1; mul → the other input's value; tanh → 1 − out²
export function backward(g: Graph, values: Values): Values;        // output.grad = 1; reverse topo; grads accumulate (+=) across consumers
export function passSteps(g: Graph): readonly PassStep[];          // forward: one per non-leaf node in topo order; backward: one per non-leaf node in reverse topo order (the output's step sets its grad to 1 and distributes it)
export type PassStep = { kind: "forward"; node: string } | { kind: "backward"; node: string };
export function revealed(g: Graph, stepIndex: number): { values: ReadonlySet<string>; grads: ReadonlySet<string> };
```

`revealed(g, k)`: after the first k steps, which nodes have a known value (leaves always; a
non-leaf once its forward step has run) and which have a known gradient (a node once its own
backward step has run; its inputs' gradients become known as they receive contributions, i.e. an
input's grad is revealed when the first consumer's backward step runs). `k = 0` is before anything
runs; `k = passSteps(g).length` is a complete pass.

`mul` with the same node as both inputs (`e·e`) is allowed: `localGrad` for each input index uses
the other index's value (equal), and `backward` accumulates both contributions, giving 2e·grad.

### Presets (`core/math/graphs.ts`)

| Key | Expression | Leaves (start, range) | Why |
|---|---|---|---|
| `neuron` (default) | o = tanh(x1·w1 + x2·w2 + b) | x1 2, x2 0, w1 −3, w2 1 (all [−4, 4]); b 6.8813735870195432 ([−8, 8]) | the notebook's neuron; 10 nodes, 14 steps |
| `product-sum` | d = a·b + c | a 2, b −3, c 10 (all [−10, 10]) | the smallest graph with both rules |
| `shared-node` | L = e·e where e = a·b + c | a 2, b −3, c 10 | e has two consumers: its gradient accumulates from two paths |

Node ids and labels for `neuron`: `x1, w1, x2, w2, b` (leaves), `x1w1` ("x1·w1"), `x2w2` ("x2·w2"),
`sum` ("x1·w1 + x2·w2"), `n` ("n"), `o` ("o"). Ops are labelled by their symbol on the sphere:
`+`, `×`, `tanh`; leaves and the output by their name.

Tests: `topoOrder(neuron)` puts every input before its consumer and ends with `o`;
`forward(neuron, starts)` gives n = 0.8814, o = 0.7071 (4 d.p.); `backward` gives the six notebook
gradients (x1 −1.5, w1 1.0, x2 0.5, w2 0, b 0.5, n 0.5); `product-sum` d = 4 with a.grad = −3,
b.grad = 2, c.grad = 1; `shared-node` L = 16, e.grad = 8, a.grad = −24; `localGrad(tanh)` matches a
central difference; `passSteps(neuron).length` = 10 (see the step count below); `revealed`
at k = 0, mid-pass and full pass.

Step count: forward steps = non-leaf nodes (neuron: 5); backward steps = non-leaf nodes in reverse
topo order (a leaf has no `_backward` of its own; its gradient is complete once its last consumer
has run). Neuron: 5 + 5 = 10 steps; `product-sum`: 2 + 2 = 4; `shared-node`: 3 + 3 = 6.

## 4. Layout (`viz/backprop/layout.ts`, pure, unit-tested)

Columns by depth (longest path from a leaf): X = −W/2 + (depth + 0.5)·W/cols with the wall width
W = 10; rows within a column spread evenly over Z ∈ [0.8, 5.2], ordered by the mean Z of a node's
inputs (leaves keep declaration order) so edges do not cross unnecessarily. Returns
`Readonly<Record<string, readonly [number, number]>>` (X, Z). Neuron: 5 columns; the leaf column
holds x1, w1, x2, w2, b top to bottom; `o` alone in the last column at Z = 3.

Tests: neuron column count and leaf order; every edge goes to a strictly greater X; two nodes never
share a position.

## 5. Scene

Shared Z-up scene kit; camera on the −y side.

**Wall.** `PlaneGeometry(10, 6)` at y = 0 centred (0, 0, 3), translucent (`--faint`, opacity .35,
`DoubleSide`, `depthWrite: false`, renderOrder 0) with an outline (`--line`), as the chain rule's
faces; reuse `createFaces`-style code but with one face (a small `wall.ts`).

**Edges.** Lines on the wall (`{ depth: true }` layer, lifted 0.01 toward −y) from each input to
its consumer, `--line`. During a backward step the edges into the active node are drawn in
`--accent` (second layer, renderOrder 3); during a forward step likewise. Direction is implied by
layout (left → right).

**Nodes.** Spheres on the wall (`MeshStandardMaterial`, roughness .5): leaves `--ink` r 0.16, ops
`--soft` r 0.14, output `--accent` r 0.16. A node whose value is not yet revealed is drawn at
opacity .35 (`transparent: true`). renderOrder 10.

**Bars.** Two `BoxGeometry(0.16, 1, 0.16)` per node scaled along y: the value bar at X − 0.12 and
the grad bar at X + 0.12, both at the node's Z, length s·|v| along −y for positive v and +y for
negative v (sign = side of the wall). Value bars `--soft`, grad bars `--accent`. s_value = 0.3
(|value| ≤ 10 → 3 units), s_grad = 1.5 (|grad| ≤ 2 → 3 units; `shared-node` grads reach 24 and are
clamped to 3 units, with the label still showing the number). Bars are hidden until their quantity
is revealed. Bar length eases over 300 ms (`t → 1 − (1 − t)³`) when it changes because a step
revealed it; leaf edits move bars instantly; with `prefers-reduced-motion` everything is instant.
At most 20 boxes, so plain meshes sharing one geometry.

**Labels** (`viz/shared/labels.ts`, new, tested): `createLabelLayer(host: HTMLElement)` appends an
absolutely positioned, `pointer-events: none` `<div class="viz-labels">` over the canvas and
returns `{ set(id, text, world: Vec3, kind: "node" | "value" | "grad" | "edge"), remove(id),
update(camera, w, h) (projects every label with `Vector3.project`, hides those behind the camera or
outside the canvas, positions with `transform: translate(-50%, -100%) translate(xpx, ypx)`),
clear(), dispose() }`. Labels per node: the label text above the sphere (`kind: "node"`); the
value as text at the value bar's tip (`"2"`, `"−6"`, `"0.7071"` via `fmt`); the gradient at the
grad bar's tip prefixed `∂ ` (`"∂ −1.5"`), both only when revealed. During a backward step, each
edge into the active node gets an `edge` label at its midpoint with the local derivative
(`"× −3"` for a mul edge whose partner value is −3, `"× 1"` for add, `"× 0.5"` for tanh), removed
when the step advances. CSS in `styles/shell.css`: `.viz-labels` absolute inset 0 overflow hidden;
spans `font: 12px var(--mono)`, `color: var(--ink)`; `.value` and `.grad` use `--soft` and
`--accent`; `.edge` has a `--bg` pill background. `update` runs only when the camera moved or the
labels changed (the assembler already knows both).

**Camera.** `frame-wall.ts`: target (0, 0, 3); position target + 12·(0.55, −1.05, 0.5) ≈ (6.6,
−12.6, 9); the wall nearly face-on from slightly right and above, so both bar directions read.
Tune in the browser check (spec fixes the octant +x, −y, +z).

## 6. State (`viz/backprop/state.ts`, pure, unit-tested)

```ts
interface BpState { readonly graph: GraphKey; readonly leaves: Values; readonly step: number; readonly playing: boolean;
  readonly show: { values: boolean; grads: boolean; edgeDerivs: boolean } }
```
`initialState()`: `neuron`, leaves at their starts, step 0, not playing, all shown. Reducers:
`setGraph(s, key)` (leaves → starts, step 0, playing false), `setLeaf(s, id, v)` (clamped to the
leaf's range; step unchanged), `stepForward(s)` (step + 1, capped at the pass length; at the cap
playing → false), `resetPass(s)` (step 0, playing false), `setPlaying(s, on)`, `setShow`,
`reset(s)` (leaves → starts, step 0, playing false, show kept). `derived(s)`: `graph`, `values =
forward(...)`, `grads = backward(...)`, `steps = passSteps(graph)`, `current: PassStep | null`
(the step just taken, `steps[step − 1]`), `revealed = revealed(graph, step)`, `done: boolean`,
`phase: "idle" | "forward" | "backward" | "done"`.

Playing is driven by the assembler's `update(dt)`: it accumulates dt and dispatches `stepForward`
every 0.7 s while `playing` (reduced motion: same cadence; steps are discrete anyway).

## 7. Controls (side panel, in order)

1. Graph select (`neuron`, `product-sum`, `shared-node`).
2. Pass: buttons Step, Play/Pause (label toggles), Reset pass; a live line "Step k of N: <text>"
   where text is "forward: n = x1w1x2w2 + b = 0.8814" or "backward: n.grad = 0.5 · 1 = 0.5 → into
   sum, b" (built by `explanation.ts` from the current `PassStep`), "Leaves are given; press Step to
   run the forward pass." at k = 0, "Pass complete." when done.
3. Leaves: one linear slider per leaf (label = leaf id, range from the graph, step 0.01, readout
   the value). Rewritten when the graph changes (the section is rebuilt).
4. Buttons: Reset, Reset view.
5. Toggles: Value bars, Grad bars, Edge derivatives.

Readouts: output value (`o = 0.7071`); one row per leaf: `x1  2   ∂ −1.5` (grad shown as "—" until
revealed).

Explanation (KaTeX via `createEquation`): the chain rule as backprop uses it,
`\frac{\partial L}{\partial x} = \frac{\partial L}{\partial y}\cdot\frac{\partial y}{\partial x}`;
the three local rules `\partial(a+b)/\partial a = 1`, `\partial(ab)/\partial a = b`,
`\partial\tanh(x)/\partial x = 1 - \tanh^2 x`; the graph's expression (`o = \tanh(x_1 w_1 + x_2 w_2 +
b)`). Text: the current step sentence (same as the pass line, longer form), and the graph's hint.
For `shared-node` the hint says: "e feeds L twice, so e.grad is the sum of both contributions:
that is why `backward` uses +=."

## 8. Interaction details

- Drag a leaf's value bar: one `attachDrag` with the leaf bars as hit targets (the bars themselves,
  r 0.16 boxes are big enough; add an invisible hit box 0.4 wide around each), `plane: { normal:
  (1, 0, 0), getOffset: (i) => X_i }` (the vertical plane through the bar), `onDrag(i, p)` →
  `setLeaf(id_i, clamp(−p[1] / s_value, range))` (p[1] is the world y of the hit; −y is positive).
  Grab cursor over a leaf bar. No click-to-place.
- Editing a leaf never changes the step: revealed values and gradients recompute in place.
- Play stops at the end of the pass; Step at the end does nothing; Reset pass returns to k = 0.
- Hint (`ai-lab.hint.backprop`): "Press Step to run the forward pass, then keep stepping through
  the backward pass."; "Drag a leaf's bar or move its slider; every revealed number updates.";
  "Orbit to read the bars: value on the left of each node, gradient on the right."
- Reset view restores the home framing.

## 9. Files and shared changes

```
src/core/math/autograd.ts, graphs.ts                    + tests
src/viz/shared/labels.ts                                + tests (projection with a known camera; hide when behind)
styles/shell.css                                        .viz-labels rules
src/viz/backprop/
  index.ts        Visualization (buildScene/unwind, apply, update with the play timer and label update)
  state.ts        reducers and derived                  + tests
  layout.ts       column/row layout                      + tests
  frame-wall.ts   home framing
  wall.ts         translucent wall and outline
  edges.ts        edge layers (all, active)
  nodes.ts        spheres with revealed opacity
  bars.ts         value/grad bars with easing and sign side; hit boxes for leaf bars
  panel.ts, panel-leaves.ts, explanation.ts             + tests
src/app/registry.ts   backprop-graph → ready; summary "Step through the forward and backward
                      passes of a small autograd graph: values fill in, then gradients flow back
                      along every edge with the local derivative written on it."
README.md             fifth scene paragraph and screenshot line; roadmap item 2 struck through
```

Testing: unit tests above; mount/dispose test as the other scenes plus "Step advances the pass
line"; a Chrome pass before merge (stepping through the neuron, dragging w1, each preset, both
themes, labels tracking during orbit, console clean).

## 10. Risks

- **Label clutter.** Up to 10 node labels + 20 numbers; the wall is 10 wide so columns are 2 apart.
  If the browser check shows overlap, value/grad text moves to the bar tips only when revealed and
  node labels shrink to 11px.
- **Bar sign convention.** Positive toward the camera (−y) matches "the bar comes out at you"; the
  panel states it once in the hint.
- **Large gradients** in `shared-node` are clamped visually; the label carries the true number.
