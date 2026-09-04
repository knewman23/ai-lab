# Neural Network Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-trainual:subagent-driven-development (if subagents available) or superpowers-trainual:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `machine-learning/neural-network`: a fixed 2-4-4-1 tanh MLP on a wall (neurons sized by activation, weights as struts), its training data and live decision boundary on the floor in front of it, trained by full-batch gradient descent one epoch at a time, with a draggable probe that lights up the activations behind any prediction.

**Architecture:** As the five existing scenes: pure tested math (`core/math/{prng,mlp,datasets}.ts`), a pure layout and a pure reducer (`viz/nn/{layout,state}.ts`) drive Three.js objects that only read state. The backprop scene's wall moves to `viz/shared/wall.ts` and gains width/height/opacity. The assembler owns the boundary grid, recomputing it only when `params` change, and drives Play from `update(dt)`.

**Tech Stack:** Vite 8 (Rolldown), strict TypeScript (`noUncheckedIndexedAccess`), three 0.185, KaTeX, vitest (jsdom for DOM). Branch `neural-network` off `main` (already created); fast-forward merge at the end.

**Spec:** `docs/superpowers/specs/2026-09-04-neural-network-design.md` (revision 2; wins over this plan).

**Conventions for every task:** `pnpm check` green before committing; commit with `git commit --only <paths>` (never `-a`); check `git show --stat HEAD`; trailer `Claude-Session: https://claude.ai/code/session_01EhwnkTHnr5TEeDqxGBKa2F` on its own line after a blank line; no hard-coded colours; subscribe to theme "change" and re-copy `Color`s as `src/viz/backprop/wall.ts` does; every listener and GPU resource disposed; scene objects detach (`removeFromParent` + `clear`) before the assembler's `disposeObject(scene)`; files under ~160 lines (split pure geometry from Three wrappers as the backprop and chain-rule scenes do); read vitest results with `rtk proxy pnpm vitest run <path>`. Copy patterns from `src/viz/backprop/` (closest sibling: wall, labels, Play timer, `apply` shape, dispose order) and `src/viz/gradient-descent/` (vertex-coloured plane, InstancedMesh).

**Files:**

```
src/core/math/prng.ts, mlp.ts, datasets.ts        + tests/core/math/{prng,mlp,datasets}.test.ts
src/viz/shared/wall.ts        generalised from src/viz/backprop/wall.ts  + tests/viz/shared/wall.test.ts
src/viz/nn/
  layout.ts  state.ts  frame-nn.ts  neurons.ts  weights.ts  floor.ts  points.ts  probe.ts
  panel.ts  explanation.ts  index.ts  labels-sync.ts
tests/viz/nn/                 layout, state, frame-nn, neurons, weights, floor, probe, panel, explanation, index
src/app/registry.ts, tests/app/registry.test.ts
README.md, docs/screenshots/neural-network-{light,dark}.png
```

---

## Chunk 1: Math and state

### Task 1: PRNG, MLP, datasets

**Files:** create `src/core/math/prng.ts`, `src/core/math/mlp.ts`, `src/core/math/datasets.ts`; tests `tests/core/math/{prng,mlp,datasets}.test.ts`.

- [ ] **Step 1: Failing tests** (spec §3). `prng.test.ts`: `mulberry32(1)` returns the same three values twice, each in [0, 1); two different seeds differ. `mlp.test.ts`: `initParams(1)` shapes (weights 4×2, 4×4, 1×4; biases 4, 4, 1), every value in (−1, 1), and identical across two calls; `forward` returns 4 layers with lengths 2, 4, 4, 1 and every hidden/output |a| ≤ 1; `predict` equals the last layer's single value; `gradients(initParams(1), DATASETS.xor)` matches central differences of `loss` for **every** weight and bias (h 1e-5, rel 1e-4, abs floor 1e-8) — this is the test that pins the factor 2 and the 1/N; `step` returns new arrays equal to `p − lr·g` and does not mutate `p`; training loop: from `initParams(1)` on `xor` at lr 0.1, `loss` is strictly decreasing over the first 20 epochs and `accuracy` ≥ 0.9 within 300 epochs; `accuracy` counts a prediction of exactly 0 as wrong; `boundaryGrid(p, 8)` has 64 entries in [−1, 1], entry (0, 0) equals `predict(p, [-3, -3])` and entry (7, 0) equals `predict(p, [3, -3])`. `datasets.test.ts`: `DATASET_KEYS` order xor, moons, circles; sizes 40, 60, 60; class balance within ±2; every point inside `DOMAIN`; the arrays are identical across two imports (module-level construction from fixed seeds); each dataset has a non-empty `hint` and `title`; **and each dataset trains to accuracy ≥ 0.9 within 300 epochs at lr 0.1 from its own `startSeed`** (the test that validates the chosen seeds; a reviewer's scratch run found `moons` stalls at 0.83 from weight seed 1 but reaches 0.9 by epoch 72 from seed 2, so expect to search a few).
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement** per spec §3. `prng.ts`: the standard `mulberry32`. `mlp.ts`: `SIZES`, `Params`, `initParams` (draw order fixed: per layer, the weight matrix row-major, then that layer's biases; each value `2 * rand() - 1`), `forward` (tanh at every layer including the output), `predict`, `loss`, `gradients` (backprop: `dL/da_out = 2(ŷ − y)/N` accumulated over the dataset, then `δ = dL/da · (1 − a²)` per layer), `step`, `accuracy`, `boundaryGrid`. `datasets.ts`: `DatasetKey`, `DOMAIN`, the three constructions from spec §3 built once at module load with fixed seeds (xor seed 11, moons 12, circles 13 — any fixed choice, recorded in the code), `DATASETS`, `DATASET_KEYS`, titles "XOR", "Two moons", "Circles", the spec §6 hints, and a `startSeed` per dataset: try small integers from 1 upward and record the first that satisfies the accuracy test above (the reviewer measured xor 1 ✓, circles 1 ✓, moons 1 ✗ / 2 ✓ with dataset seeds 11/12/13, but your Box–Muller ordering may differ, so verify). Gaussian noise via Box–Muller on the PRNG.
- [ ] **Step 4:** Run, `pnpm check`; commit "Add a seeded PRNG, a tiny MLP and three toy datasets".

### Task 2: Layout and state

**Files:** create `src/viz/nn/layout.ts`, `src/viz/nn/state.ts`; tests `tests/viz/nn/{layout,state}.test.ts`.

- [ ] **Step 1: Failing tests** (spec §4, §5 Training). Layout: `neuronPosition(l, i)` gives X = −3.75, −1.25, 1.25, 3.75 for l = 0…3; Z = 5.2 and 0.8 for the two input neurons, 5.2, 3.7333, 2.2667, 0.8 for a hidden layer, 3 for the single output; `floorPoint([0, 0])` = (0, −3.5, 0), `floorPoint([-3, -3])` = (−3, −6.5, 0), `floorPoint([3, 3])` = (3, −0.5, 0); exports `WALL_W = 10`, `WALL_H = 6`, `FLOOR_SIZE = 6`, `FLOOR_CY = -3.5`. State: `initialState()` (xor, seed `DATASETS.xor.startSeed`, params from `initParams` of it, epoch 0, lr 0.1, not playing, probe [0, 0], all shown); `setDataset` sets the seed to the new dataset's `startSeed`, re-inits params from it and zeroes the epoch; `trainEpoch` advances the epoch by 1 and returns new params that differ from the old; `setLr` clamps to [0.001, 0.5]; `setProbe` clamps both coordinates to `DOMAIN`; `setPlaying`; `setShow` changes only that flag; `reset` advances the seed by 1 (from wherever it is), re-inits, zeroes the epoch, stops play, keeps lr/probe/show; `derived` returns `dataset`, `loss`, `accuracy`, `probeActivations` (4 layers) and `probeOutput`, and does **not** include a boundary grid.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement.** `layout.ts` declares its own `LIFT_WALL = [0, −0.01, 0]` (do not reach for `src/viz/shared/lift.ts`: its `FACES.front` lift is +0.01, the wrong direction here), exactly as `src/viz/backprop/layout.ts` does. `state.ts` mirrors `src/viz/backprop/state.ts` in style and exports `EPOCH_MS = 100` (spec §5).
- [ ] **Step 4:** Run, `pnpm check`; commit "Add neural network layout and scene state".

## Chunk 2: Scene objects

### Task 3: Shared wall, framing, neurons

**Files:** move `src/viz/backprop/wall.ts` → `src/viz/shared/wall.ts` (`git mv`) and generalise; update `src/viz/backprop/index.ts` (and any test) imports; create `src/viz/nn/frame-nn.ts`, `src/viz/nn/neurons.ts`; tests `tests/viz/shared/wall.test.ts` (moved from `tests/viz/backprop/wall.test.ts`), `tests/viz/nn/{frame-nn,neurons}.test.ts`.

- [ ] **Step 1: Failing tests.** Wall: `createWall(theme, { width: 10, height: 6, opacity: 0.18 })` puts the plane at y = 0 spanning x ∈ [−5, 5], z ∈ [0, 6] (apply `mesh.matrixWorld` to a geometry clone and check the `Box3`, as the backprop test already does); a different size, e.g. `{ width: 8, height: 4, opacity: 0.3 }`, spans x ∈ [−4, 4], z ∈ [0, 4] with `material.opacity` 0.3; the outline has 8 endpoints and is lifted −0.01 in y; theme change recolours; dispose releases mesh geometry, material and the outline layer. The backprop wall's own behaviour is unchanged (its existing assertions move into this file with `{ width: WALL_W, height: WALL_H, opacity: 0.18 }`). `frame-nn.test.ts`: `frameNn()` target (0, −1.5, 2.5), position = target + 12·(0.8, −1.1, 0.7) = (9.6, −14.7, 10.9), in the +x, −y, +z octant. `neurons.test.ts`: `createNeurons(theme)` then `set([[0.5, -0.5], [1, 0, -1, 0.25], [...], [0.8]])` (any four arrays matching SIZES) gives 11 meshes at the `neuronPosition` world points lifted −0.01 in y, each scaled so its radius is 0.08 + 0.14·|a| (assert `mesh.scale.x` against a base geometry radius of 1), positive activations on the ink material and negative on the accent material (assert `mesh.material` identity, two distinct materials in total); a theme change recolours both materials; dispose releases one shared geometry and two materials.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement.** `shared/wall.ts` takes `WallOptions { width; height; opacity }`, owns `LIFT = -0.01` in y, and keeps the `{ group, mesh, outline, dispose }` surface. `backprop/index.ts` passes its own `WALL_W`/`WALL_H`/0.18; delete `src/viz/backprop/wall.ts`. `neurons.ts` `createNeurons(theme)` → `{ group, meshes: readonly Mesh[], set(activations: readonly (readonly number[] | Float64Array)[]), dispose }`: one shared `SphereGeometry(1, 20, 12)` scaled per neuron, two shared `MeshStandardMaterial({ roughness: 0.5 })` (ink, accent) swapped by sign, renderOrder 10.
- [ ] **Step 4:** Run all tests (backprop suite must stay green), `pnpm check`; commit "Move the wall helper to viz/shared and add neural network framing and neurons".

### Task 4: Weights, floor, data points

**Files:** create `src/viz/nn/weights.ts`, `src/viz/nn/floor.ts`, `src/viz/nn/points.ts`; tests `tests/viz/nn/{weights,floor}.test.ts`.

- [ ] **Step 1: Failing tests.** Weights: `createWeights(theme)` then `set(initParams(1))` gives 28 struts (8 + 16 + 4); a strut between two neurons is positioned at their midpoint (lifted −0.08 in y), its length (the local y scale) equals the distance between the two neuron points, and its thickness (x and z scale) is 0.02 + 0.12·min(1, |w|/3); its material is ink for w > 0 and accent for w < 0; `group.visible` follows `setShow(on)`; dispose releases one geometry and two materials. Floor: `createFloor(theme)` then `set(grid)` for a grid whose entries are all +1 makes every vertex colour equal the ink colour, all −1 gives accent, all 0 gives the bg colour; **orientation**: with a grid that is +1 for entries with `iy === n - 1` and −1 elsewhere, the geometry vertices with the largest world y carry the ink colour (this is the mirror rule from spec §5); `setShow(false)` writes a uniform faint colour and opacity 0.18, `setShow(true)` restores the kept grid at 0.85; a theme change rewrites the colours from the kept grid; dispose releases geometry, material and the outline. Points: a short test for `count` after `set(DATASETS.xor)` (40), `frustumCulled === false`, and one instance's colour matching the theme for a +1 point — the InstancedMesh flags are a known trap in this codebase.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement** per spec §5. `weights.ts`: shared `BoxGeometry(1, 1, 1)`, per-strut `position` at the midpoint and `quaternion` from `setFromUnitVectors(up, direction)`, `scale.set(t, length, t)`. `floor.ts`: `PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE, 39, 39)` at (0, FLOOR_CY, 0) with a `color` `BufferAttribute`, `MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, side: DoubleSide })`, renderOrder 0, plus a `--line` outline layer; the mirror `grid[ix + n * (n - 1 - iy)]`; a two-segment lerp accent → bg → ink. `points.ts`: `InstancedMesh` per spec (`frustumCulled = false`, `setColorAt`, `instanceColor.needsUpdate`, `computeBoundingSphere()`), `set(dataset)` writing up to 60 instances and setting `count`.
- [ ] **Step 4:** Run, `pnpm check`; commit "Add neural network weight struts, the boundary floor and the data points".

### Task 5: Probe

**Files:** create `src/viz/nn/probe.ts`; test `tests/viz/nn/probe.test.ts`.

- [ ] **Step 1: Failing tests.** `createProbe(theme)` → `{ group, mesh, hitTarget, set(p: readonly [number, number]), dispose }`: `set([1, -2])` puts the visible sphere (r 0.12, `--soft`) and the hit sphere (r 0.25, `MeshBasicMaterial({ visible: false })` on a visible mesh) at `floorPoint([1, -2])` raised 0.12 in z; theme change recolours; dispose releases both geometries and both materials.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement**, copying the sphere/hit recipe from `src/viz/chain-rule/points.ts`.
- [ ] **Step 4:** Run, `pnpm check`; commit "Add the neural network probe".

## Chunk 3: Panel, assembly, registry

### Task 6: Explanation and panel

**Files:** create `src/viz/nn/explanation.ts`, `src/viz/nn/panel.ts`; tests `tests/viz/nn/{explanation,panel}.test.ts` (jsdom).

- [ ] **Step 1: Failing tests.** Pure: `trainingLine(state, d)` → "Epoch <n>: loss <fmt>, accuracy <pct>%" with the numbers computed in the test from `initialState()` and `derived` (do not hard-code a literal loss; percentages rounded to whole numbers); `probeText(state, d)` → "(0, 0) → 0.1234 (+1)" with the class from the sign and 0 reading "−1". Panel (`createNnPanel(host, handlers)`): dataset select lists "XOR", "Two moons", "Circles" in `DATASET_KEYS` order and calls `onDataset`; Step / Play–Pause / Reset call `onStep`, `onPlay(!playing)` with the label following `state.playing`, and `onReset`; the lr log slider calls `onLr` and reflects `state.lr` on render without firing; Reset view calls `onResetView`; toggles Weights / Data / Boundary call `onShow(key, on)` and reflect `state.show` without firing; the training line and probe readout render; equations re-render only when the dataset changes (`.katex` node identity); `dispose` empties the host.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement** per spec §6, copying the structure of `src/viz/backprop/panel.ts`: sections Setup (dataset select), Training (Step, Play/Pause, Reset, lr slider, training line), Run (Reset view), Show (three toggles), Readouts (probe), Explanation. KaTeX blocks per spec §6 via `createEquation`; text sentences and the dataset hint.
- [ ] **Step 4:** Run, `pnpm check`; commit "Add the neural network panel and explanation".

### Task 7: Assembly

**Files:** create `src/viz/nn/index.ts`, `src/viz/nn/labels-sync.ts`; test `tests/viz/nn/index.test.ts` (jsdom).

- [ ] **Step 1: Failing test** (copy `tests/viz/backprop/index.test.ts`): metadata `id "neural-network"`, topic "machine-learning", title "Neural network", summary exactly the spec §8 string, status "ready"; first `update(0.016)` renders, second idles; clicking Step advances the training line to "Epoch 1"; Play then `update(0.15)` advances an epoch and `update(0.05)` does not, and `update` returns true while playing; the label layer holds "input", "hidden", "output" and "x₁"; theme listener, pointer listeners, label div and panel all cleaned up on dispose.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement** mirroring `src/viz/backprop/index.ts`: `buildScene` with unwind (kit, wall, floor, points, weights, neurons, probe, label layer created before the hint), `home = frameNn()`, `apply(next)`: `derived` → if `params` differ from the cached identity recompute `boundaryGrid` and `floor.set(grid)` → `points.set(d.dataset)` when the dataset changed → `weights.set(state.params)` → `neurons.set(d.probeActivations)` → `probe.set(state.probe)` → `syncLabels` (column labels "input"/"hidden"/"hidden"/"output" above each column, "x₁"/"x₂" at the input neurons, and the probe's output at the probe) → `panel.render(state, d)` → `dirty = true`. Show toggles drive `weights.setShow`, `points.setShow`, `floor.setShow`. One `attachDrag`: `hitTargets: [probe.hitTarget]`, `getPlaneZ: () => 0`, `surfaceTarget: floor.mesh`, `onDrag: (_i, p) => { hint?.hide(); apply(setProbe(state, floorToInput(p))) }` where `floorToInput` inverts `floorPoint` (world x → x₁, world y + 3.5 → x₂) and `setProbe` clamps. `update(dt)`: `controls.update`; while playing accumulate `dt * 1000` against `EPOCH_MS` and `apply(trainEpoch(state))`; render when `dirty || moved`; `labels.update(camera, w, h)` before each render; return `rendered || state.playing`. Dispose order: theme listener → drag → hint → labels → probe, neurons, weights, points, floor, wall → `disposeObject(kit.scene)` → `kit.dispose()` → panel. Export `neuralNetwork: Visualization`.
- [ ] **Step 4:** Run, `pnpm check`; commit "Assemble the neural network scene".

### Task 8: Registry, README, merge

**Files:** modify `src/app/registry.ts`, `tests/app/registry.test.ts`, `README.md`; screenshots added by the coordinator.

- [ ] **Step 1:** Registry entry `neural-network` → `status: "ready"`, `load: () => import("../viz/nn").then((m) => m.neuralNetwork)`, summary from spec §8; in the registry test remove it from `roadmapExpectations` and add a `loadReady("machine-learning", "neural-network")` case mirroring the backprop one.
- [ ] **Step 2:** `pnpm build`; confirm a separate `nn` chunk and an entry chunk within a few hundred bytes of `main`.
- [ ] **Step 3:** README: "Six scenes so far", a paragraph after the backprop one, a screenshot line, roadmap item 3 struck through.
- [ ] **Step 4:** `pnpm check`; commit "Register the neural network scene; README".
- [ ] **Step 5 (coordinator):** Chrome pass (Play on each dataset, probe drag, toggles, both themes, console clean), screenshots, camera tune if needed, final integrated review, fast-forward merge, push, verify the live site.
