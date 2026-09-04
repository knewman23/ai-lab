# Neural network — a tiny MLP learning a 2D classification, layers on a wall, boundary on the floor

Date: 2026-09-04
Status: as built (revision 4: dataset seeds, input-layer bound, xor labelling and the Play-stop list corrected against the code; revision 3 added per-dataset start seeds)
Parent: [AI Lab design](2026-09-03-ai-lab-design.md); siblings: [Backprop graph](2026-09-03-backprop-graph-design.md), [Gradient descent](2026-09-03-ai-lab-design.md)
Registry: replaces the `machine-learning` roadmap entry `neural-network`

## 1. Purpose

Show a small multilayer perceptron learning. The network stands on a wall: input, hidden and output
neurons as columns, every weight a strut whose thickness is |w| and whose colour is its sign, every
activation a sphere whose size is |a|. The training data lies on the floor in front of the wall, the
floor is the two-dimensional input space, and the network's current output over that whole space is
painted onto it, so each gradient step visibly bends the decision boundary toward the data. A probe
point dragged across the floor lights up the activations that produce its prediction, tying the two
pictures together.

Success criteria: two clicks from the home page; 60 fps while playing at ten epochs a second; on the
`xor` dataset with the default seed and learning rate the loss falls monotonically for the first 20
epochs and accuracy reaches at least 0.9 within 300 epochs (asserted in a test); dragging the probe across the boundary
flips the output readout's sign; the gradient used for training matches a finite-difference gradient
(asserted in a test).

Out of scope: more than one architecture, user-uploaded data, mini-batches, optimizers other than
plain gradient descent, regularisation, softmax or multi-class, per-neuron bias display.

## 2. Decisions

| Question | Decision | Alternatives |
|---|---|---|
| Scope | A fixed 2-4-4-1 tanh MLP trained by full-batch gradient descent on three toy datasets, stepped or played | Forward pass only; user-built architectures |
| 3D | Network on a vertical wall (y = 0); data and decision boundary on the floor (z = 0) in front of it; probe on the floor | Layers stacked in depth; boundary as a height field |
| Weights | Thin boxes (struts) between neurons, thickness 0.02 + 0.12·min(1, \|w\|/3), colour `--ink` for w > 0 and `--accent` for w < 0 | Line width (fixed at 1 in WebGPU/WebGL); colour only |
| Activations | Sphere radius 0.08 + 0.14·\|a\|, colour `--ink` for a > 0 and `--accent` for a < 0 (input neurons show the probe's coordinates) | Brightness only; bars as in the backprop scene |
| Boundary | Vertex-coloured `PlaneGeometry(6, 6, 39, 39)` on the floor, one forward pass per vertex (1600) per epoch, colour mixes `--accent` (−1) → `--bg` (0) → `--ink` (+1) | Texture upload; contour lines |
| Loss | Mean squared error against targets ±1, as in the micrograd lecture the notebooks follow | Cross-entropy with a sigmoid output |
| Play speed | 10 epochs per second (`EPOCH_MS = 100`); Step runs one epoch | Faster with skipped redraws |
| Randomness | Seeded `mulberry32` PRNG (`core/math/prng.ts`). The three datasets are built once at module load from fixed seeds and never change; only `initParams` takes the scene's seed, which Reset advances | `Math.random` |

## 3. Math (`core/math/mlp.ts`, `core/math/datasets.ts`, `core/math/prng.ts`; pure, unit-tested)

```ts
// prng.ts
export function mulberry32(seed: number): () => number;         // uniform [0, 1)
// mlp.ts
export const SIZES = [2, 4, 4, 1] as const;
export interface Params { readonly weights: readonly Float64Array[]; readonly biases: readonly Float64Array[] } // weights[l] is out×in row-major
export function initParams(seed: number): Params;              // uniform(−1, 1), micrograd style; draw order is fixed: for each layer in order, the weight matrix row-major, then that layer's biases
export function forward(p: Params, x: readonly [number, number]): readonly Float64Array[]; // activations per layer incl. input; tanh everywhere
export function predict(p: Params, x): number;                 // last activation
export interface Dataset { readonly key: DatasetKey; readonly title: string; readonly points: readonly { x: [number, number]; y: 1 | -1 }[]; readonly startSeed: number; readonly hint: string }
export function loss(p: Params, d: Dataset): number;           // mean (predict − y)²
export function gradients(p: Params, d: Dataset): Params;      // ∂/∂θ of `loss` exactly: analytic backprop through the tanh layers, including the factor 2 from the square and the 1/N average
export function step(p: Params, g: Params, lr: number): Params; // p − lr·g, new arrays
export function accuracy(p: Params, d: Dataset): number;       // fraction with sign(predict) === y (0 counts as wrong)
export function boundaryGrid(p: Params, n = 40): Float32Array; // predict over the domain, row-major entry (ix + n·iy) with x and y both increasing from −3 to 3
// datasets.ts
export type DatasetKey = "xor" | "moons" | "circles";
export const DATASETS: Readonly<Record<DatasetKey, Dataset>>; export const DATASET_KEYS;
export const DOMAIN = [-3, 3] as const;                         // both input coordinates
```

Datasets (built once at module load from fixed seeds 11, 12 and 13; coordinates within the domain, targets ±1):

| Key | Points | Construction | Why |
|---|---|---|---|
| `xor` (default) | 40 | 10 per quadrant, centres (±1.5, ±1.5), Gaussian σ 0.45; y = +1 when the cluster's centre has coordinates of matching sign (labelling by cluster rather than by the noisy sample keeps the split exactly 20/20) | not linearly separable; the classic reason for a hidden layer |
| `moons` | 60 | the classic pair: upper arc centre (−0.8, −0.5), radius 1.6, θ evenly spaced over [0, π], y = +1; lower arc centre (0.8, 0.5), θ over [π, 2π], y = −1; 30 each, Gaussian σ 0.2 | a curved boundary |
| `circles` | 60 | inner disc radius ≤ 0.8 (+1) and ring radius 1.8–2.4 (−1), σ 0.15 | a closed boundary |

Each dataset carries a `startSeed`: a weight-init seed verified to train it to ≥ 0.9 accuracy at the
default learning rate. Some seeds stall (a 2-4-4-1 net on `moons` plateaus at 0.83 from seed 1), and
the first thing a visitor sees should not be a stuck network, so `initialState()` and `setDataset`
both take the new dataset's `startSeed` rather than carrying the old seed across. Reset still walks
forward from there (seed + 1), which is where a stalling run can legitimately turn up; the hint says
to press Reset again.

Training: `lr` default 0.1 (log slider 0.001 … 0.5). One epoch = one full-batch step. Reset uses seed + 1 so a second run looks different but is
still reproducible. The datasets are fixed data, not re-rolled by Reset.

Tests: `mulberry32(1)` yields a fixed first three values (recorded once) and is in [0, 1); `initParams`
shapes (4×2, 4×4, 1×4) and range; `forward` layer count 4, with |a| ≤ 1 for layers 1–3 (layer 0 is the raw input, which is why `neurons.set` scales it); `gradients` matches central
differences of `loss` (h 1e-5, rel 1e-4) for every weight and bias on `xor` at seed 1; `step`
returns new arrays with `p − lr·g`; `loss` falls monotonically over the first 20 epochs on `xor` at
lr 0.1 from `DATASETS.xor.startSeed` and `accuracy ≥ 0.9` within 300 epochs; the same accuracy bound
from each dataset's own `startSeed` at the default lr; each dataset has the stated size, class
balance within ±2, all points in the domain, and is identical across two constructions;
`boundaryGrid` has n² entries in [−1, 1] and entry (0, 0) equals `predict` at (−3, −3).

## 4. Layout (`viz/nn/layout.ts`, pure)

Wall x ∈ [−5, 5], z ∈ [0, 6]. Layer l of L = 4 sits at X = −5 + (l + 0.5)·10/L (−3.75, −1.25,
1.25, 3.75); the n neurons of a layer sit at Z = 5.2 − i·4.4/(n − 1) (single neuron at 3), so the
input pair is at Z 5.2 and 0.8, hidden neurons at 5.2, 3.73, 2.27, 0.8, the output at 3. Export
`neuronPosition(l, i): [X, Z]`.

Floor: the plane z = 0, y ∈ [−6.5, −0.5], x ∈ [−3, 3], mapping input (x₁, x₂) → world
(x₁, −3.5 + x₂, 0) (`floorPoint`). The floor lies on the camera's side of the wall (−y), so it is
seen in front of the wall rather than through it; its far edge stops 0.5 short of the wall plane.

Tests: the four X values; Z values for n = 2, 4, 1; `floorPoint([x1, x2])`.

## 5. Scene

Shared Z-up scene kit. Camera (`frame-nn.ts`): target (0, −1.5, 2.5) (between the floor's centre
and the wall), position target + 12·(0.8, −1.1, 0.7) = (9.6, −14.7, 10.9): the right-and-above view
the backprop scene settled on, far enough back that the floor fills the foreground and the wall
stands behind it. Tune in the browser check within the +x, −y, +z octant.

**Wall.** `src/viz/shared/wall.ts` generalises the backprop wall: `createWall(theme, { width, height,
opacity })` → `{ group, mesh, outline, dispose }` at y = 0 centred (0, 0, height/2), owning its own
0.01 lift toward −y rather than importing one from a scene; the backprop scene switches to it and
keeps `mesh`/`outline` on the returned object so its tests stay green. Here width 10, height 6,
opacity .18.

**Neurons** (`neurons.ts`): 11 spheres (`MeshStandardMaterial`, roughness .5) at `neuronPosition`
lifted 0.01 toward −y. Two shared materials, `ink` and `accent`, are swapped onto each mesh by sign,
so a theme "change" recolours two materials and no per-object state. `set(activations)` takes `forward`'s
output verbatim and does the input-layer scaling itself: layer 0 arrives as the raw probe
coordinates in [−3, 3], so `set` divides that layer by `DOMAIN[1]` before sizing, while layers 1–3
are already in [−1, 1]. Doing it here rather than at the call site is deliberate: a caller that
forgot would render a plausible-looking wrong picture, since the radius formula clamps at |a| = 1.
Each sphere then gets radius 0.08 + 0.14·min(1, |a|) and a material by sign (`--ink` for a ≥ 0,
`--accent` for a < 0; the sphere's tie-break at exactly 0 is ink, unlike the §6 readout's "−1",
because the common case is the probe resting at the origin). Labels (label layer): "input", "hidden", "hidden",
"output" above each column (`node` kind), and "x₁"/"x₂" beside the two input neurons.

**Weights** (`weights.ts`): 28 struts, `BoxGeometry(1, 1, 1)` shared, each positioned at the
midpoint of its two neurons, rotated to point from one to the other, scaled to (thickness, length,
thickness) with thickness 0.02 + 0.12·min(1, |w|/3); the same two shared materials as the neurons,
by sign; lifted 0.08 toward −y so a full-thickness strut clears the wall plane; `set(params)`.
Toggle "Weights".

**Floor** (`floor.ts`): `PlaneGeometry(6, 6, 39, 39)` at z = 0 centred (0, −3.5, 0) with a vertex
`color` attribute (1600 vertices), `MeshBasicMaterial({ vertexColors: true, transparent: true,
opacity: 0.55 })`, renderOrder 0; `set(grid: Float32Array)` writes each vertex colour as
`mix(--accent, --bg, --ink)` at t = (value + 1)/2 (two-segment lerp through `--bg` at 0.5), using
copies of the theme `Color`s; a thin `--line` outline. **Vertex order:** `PlaneGeometry` lays its
vertices out with the local y axis running from +3 down to −3, so geometry vertex `ix + n·iy` takes
its colour from grid entry `ix + n·(n − 1 − iy)` (the same mirror `gradient-descent/surface-mesh.ts`
documents). The module keeps the last grid so a theme "change" can rewrite all 1600 colours. Toggle
"Boundary": off writes a uniform `--faint` to every vertex and drops opacity to .18; on rewrites
from the kept grid at .55 (the browser check showed .85 made the field swamp the data points, which
share its two colours). Data points (`points.ts`): one
`InstancedMesh` of spheres r 0.07 (up to 60 instances) at `floorPoint` + z 0.07, `setColorAt` per
instance `--ink` (+1) / `--accent` (−1) with `instanceColor.needsUpdate` and, per the toolchain
notes, `frustumCulled = false` plus `computeBoundingSphere()` after the matrices; re-coloured on a
theme "change"; toggle "Data".

**Probe** (`probe.ts`): a sphere r 0.12 `--soft` standing on the floor at the probe position (raised
its own radius, 0.12, in z so it rests on the plane), draggable on the
plane z = 0 (`getPlaneZ: () => 0`), clamped to the domain; a hit sphere r 0.25; a label at the sphere carrying the bare output value (`value`
kind, matching how every other scene renders a numeric label). Dragging the probe re-runs `forward` for its position and re-colours the wall's
activations; it never changes the parameters.

**Training** (`state.ts`): `NnState { dataset: DatasetKey; seed: number; params: Params; epoch:
number; lr: number; playing: boolean; probe: [number, number]; show: { weights, data, boundary } }`.
Reducers: `initialState()` (xor, seed `DATASETS.xor.startSeed`, `initParams` of it, epoch 0, lr 0.1, not playing, probe
(0, 0), all shown); `setDataset(s, key)` (seed ← that dataset's `startSeed`, params re-initialised
from it, epoch 0, playing false); `trainEpoch(s)` (params ← step(params, gradients(params, dataset), lr), epoch + 1);
`setLr(s, lr)` (clamp); `setPlaying`; `setProbe(s, p)` (clamp to the domain); `setShow`;
`reset(s)` (seed + 1, re-init, epoch 0, playing false; lr, probe, show kept). `derived(s)`:
`dataset`, `loss`, `accuracy`, `probeActivations = forward(params, probe)` and `probeOutput`. The
boundary grid is **not** in `derived`: the assembler holds it and recomputes `boundaryGrid(params)`
only when `apply` sees a `params` it has not seen before (identity compare), so dragging the probe
costs no grid work.

Play: the assembler steps one epoch every `EPOCH_MS = 100` while playing, in `update(dt)`, returning
true while playing. `trainEpoch` on a `gradients` call costs 40–60 forward/backward passes plus the
1600-point grid: well under a millisecond in practice; the DEV build logs a warning if an epoch's
apply takes more than 8 ms.

## 6. Controls (side panel, in order)

1. Dataset select (xor, moons, circles).
2. Training: buttons Step (one epoch), Play/Pause, Reset (new seed); lr log slider (0.001 … 0.5,
   default 0.1, readout `lr = <fmt>`); a live line "Epoch <n>: loss <fmt>, accuracy <pct>%".
3. Buttons: Reset view.
4. Toggles: Weights, Data, Boundary.

Readouts: the probe only (`(x₁, x₂) → <output>`, then the predicted class "+1" or "−1"; an output of
exactly 0 reads "−1", matching `accuracy`, which counts 0 as wrong). Epoch, loss and accuracy live in
the training line above, so they are not repeated here.

Explanation (KaTeX via `createEquation`): the layer rule `a^{(l)} = \tanh(W^{(l)} a^{(l-1)} +
b^{(l)})`; the loss `L = \frac{1}{N}\sum_i (\hat y_i - y_i)^2`; the update `W \leftarrow W - \eta\,
\partial L/\partial W`. Text: "Each Step runs one full-batch gradient descent epoch: the gradient of
the loss with respect to every weight (the backprop scene, done 28 times at once), then a step of
size η = <lr>." plus the dataset's hint (xor: "No single line separates the classes: the hidden layer
has to bend the space first."; moons: "Two interleaving arcs; watch the boundary curve between
them, and press Reset for a different starting seed if it stalls."; circles: "The boundary has to close around the inner disc.").

## 7. Interaction details

- Drag the probe on the floor (`attachDrag`, `getPlaneZ: () => 0`, hit sphere); click anywhere on
  the floor plane places it (`surfaceTarget` = the floor mesh). Grab cursor over the probe.
- Step/Play/Reset as in §5; there is no end of training, so Play stops only on Pause, Reset, or a dataset change. Nothing
  eases or animates apart from the epoch cadence, so `prefers-reduced-motion` changes nothing (the
  steps are discrete either way).
- Hint (`ai-lab.hint.nn`): "Press Play and watch the boundary on the floor bend toward the data.";
  "Drag the grey probe across the floor to light up the activations behind its prediction."; "Thick
  struts are big weights; blue is negative."
- Reset view restores the home framing.

## 8. Files and shared changes

```
src/core/math/prng.ts, mlp.ts, datasets.ts               + tests
src/viz/shared/wall.ts        generalised from viz/backprop/wall.ts (width, height, opacity);
                              backprop imports it; backprop tests unchanged
src/viz/nn/
  index.ts  state.ts  layout.ts  frame-nn.ts  neurons.ts  weights.ts  floor.ts  points.ts  probe.ts
  panel.ts  explanation.ts                                + tests
src/app/registry.ts   neural-network → status "ready" with a lazy `load` chunk like the other
                      scenes; summary "Watch a tiny network learn: layers on a wall
                      with weights as struts, the data and the decision boundary on the floor, one
                      gradient step at a time."
README.md             sixth scene paragraph and screenshot line; roadmap item 3 struck through
```

Testing beyond the unit tests: mount/dispose test as the other scenes plus "Step advances the epoch
line"; Chrome pass (Play on each dataset until the boundary tracks the data, probe drag flips the readout,
toggles, both themes, console clean, 60 fps while playing). `moons` may need a Reset or two before a
seed separates it cleanly; that is expected, not a failure.

## 9. Risks

- **Training gets stuck** on `xor` for some seeds. The default seed is chosen so the success
  criterion holds; Reset moves to the next seed, and the hint says to Reset if the boundary stalls.
- **Large learning rates.** tanh bounds every activation, so the loss cannot exceed 4 and lr 0.5
  cannot produce NaN: the boundary just oscillates. No guard is needed.
- **Floor repaint cost**: 1600 forward passes per epoch at 10 Hz is ~16k tanh-layer evaluations per
  second; trivial. The colour attribute upload is 1600 × 3 floats per epoch.
- **Occlusion**: the floor is nearer the camera than the wall, so at a low orbit angle the floor's
  far half can cover the wall's bottom row of neurons. From the home camera (27° above) it does not:
  the sight line to the wall's base still clears the floor's near edge. Orbit resolves the rest.
