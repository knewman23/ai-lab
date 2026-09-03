# Backprop Graph Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-trainual:subagent-driven-development (if subagents available) or superpowers-trainual:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `machine-learning/backprop-graph`: the notebook-01 autograd DAG on a translucent wall with value and gradient bars through it, a stepped forward then backward pass with local derivatives on the active edges, editable leaves (drag or slider), and an HTML label overlay.

**Architecture:** As the four existing scenes: pure tested math (`core/math/autograd.ts`, `graphs.ts`), a pure layout (`viz/backprop/layout.ts`) and a pure reducer (`viz/backprop/state.ts`) drive Three.js objects that only read state. One new shared piece: `viz/shared/labels.ts`, an HTML overlay whose spans are projected from world points whenever the camera moves or a label changes. Bars ease over 300 ms in the assembler's `update(dt)`, which also drives Play.

**Tech Stack:** Vite 8 (Rolldown), strict TypeScript, three 0.185 (`three` core in scene code), KaTeX, vitest (jsdom for DOM). Branch `backprop-graph` off `main` (already created); fast-forward merge at the end.

**Spec:** `docs/superpowers/specs/2026-09-03-backprop-graph-design.md` (wins over this plan).

**Conventions for every task:** `pnpm check` green before committing; commit with `git commit --only <paths>` (never `-a`, never `git reset`/`rebase` on the shared branch); check `git show --stat HEAD`; trailer `Claude-Session: https://claude.ai/code/session_01EhwnkTHnr5TEeDqxGBKa2F`; no hard-coded colours; copy theme `Color`s and subscribe to theme "change" as `src/viz/chain-rule/faces.ts` does; every listener/GPU resource disposed; scene objects detach (`removeFromParent` + `clear`) before the assembler's `disposeObject(scene)`; files under ~160 lines (split pure geometry from Three wrappers as the chain-rule scene does); rtk's vitest parser prints nothing for some reporters, so use `rtk proxy pnpm vitest run <path>`. Copy patterns from `src/viz/chain-rule/` (closest sibling: faces, world-coordinate layers, one `attachDrag` with a per-index plane, `apply` shape, dispose order).

**Files:**

```
src/core/math/autograd.ts, graphs.ts               + tests/core/math/{autograd,graphs}.test.ts
src/viz/shared/labels.ts                           + tests/viz/shared/labels.test.ts
styles/panel.css                                   .viz-labels rules (next to .canvas-hint)
src/viz/backprop/
  state.ts  layout.ts  frame-wall.ts  wall.ts  edges.ts  nodes.ts  bars.ts
  panel.ts  panel-leaves.ts  explanation.ts  index.ts
tests/viz/backprop/                                state, layout, frame-wall, bars (easing), explanation, panel, index
src/app/registry.ts, tests/app/registry.test.ts
README.md, docs/screenshots/backprop-{light,dark}.png
```

---

## Chunk 1: Math, labels, state, layout

### Task 1: Autograd model and presets

**Files:** create `src/core/math/autograd.ts`, `src/core/math/graphs.ts`; tests `tests/core/math/autograd.test.ts`, `tests/core/math/graphs.test.ts`.

- [ ] **Step 1: Failing tests** (spec §3). `graphs.test.ts`: `GRAPH_KEYS` order neuron, product-sum, shared-node; `GRAPHS.neuron` has 10 nodes, output `o`, leaves `[x1, w1, x2, w2, b]` with the table's starts and ranges; node labels per spec; every `inputs` id exists; `shared-node` has nodes e (add of ab, c), f (mul of e, c) and L (add of f, e), output L. `autograd.test.ts`: `topoOrder(neuron)` puts every input before its consumer, ends with `o`, is deterministic; `forward(neuron, starts(neuron))` → x1w1 −6, x2w2 0, sum −6, n 0.8814 (4 d.p.), o 0.7071; `backward` → o 1, n 0.5, sum 0.5, b 0.5, x1w1 0.5, x2w2 0.5, x1 −1.5, w1 1.0, x2 0.5, w2 0; product-sum d 4, grads a −3, b 2, c 1; shared-node e 4, f 40, L 44 and full grads L 1, f 1, e 11, a −33, b 22, c 15; `gradsAfter(shared-node, values, 1)` = { L: 1, f: 1, e: 1 } exactly (no a, b, c keys), after 2 backward steps e 11 and c 4, after 3 the full set; `localGrad(neuron, "o", 0, values)` ≈ central difference of tanh at n (rel 1e-4); `localGrad` add → 1, mul → the other input's value; `passSteps(neuron)` has 10 entries, first five `forward` in topo order of non-leaves, last five `backward` in reverse, `passSteps(product-sum)` 4, `shared-node` 6; `revealed(neuron, 0)` = { values: the five leaves, backwardSteps: 0 }; after step 5 all ten values, backwardSteps 0; after step 6 backwardSteps 1 and `gradsAfter(…, 1)` has keys {o, n}; after step 7 keys {o, n, sum, b}; after 10 all ten with the notebook values; `backward` equals `gradsAfter` at the full count.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement** `autograd.ts` (`Op`, `GraphNode`, `Graph`, `Values`, `PassStep`, `topoOrder` (DFS post-order from the output, visiting inputs in order, matching the notebook), `forward`, `localGrad`, `gradsAfter(g, values, k)` (output grad 1, then the first k non-leaf nodes in reverse topo each do `grads[input] = (grads[input] ?? 0) + localGrad · grads[node]`; a key exists only once a contribution has landed), `backward` = `gradsAfter` at the full count, `passSteps`, `revealed` (values set + `backwardSteps`), helper `starts(g): Values`; `Graph.key` is typed `string` here to avoid a cycle with graphs.ts) and `graphs.ts` (`GraphKey`, `GRAPHS`, `GRAPH_KEYS`, the three presets with titles "tanh neuron", "a·b + c", "L = e·c + e", hints from the spec).
- [ ] **Step 4:** Run, `pnpm check`; commit "Add the autograd graph model and the three preset graphs".

### Task 2: Label overlay

**Files:** create `src/viz/shared/labels.ts`; modify `styles/shell.css`; test `tests/viz/shared/labels.test.ts` (jsdom).

- [ ] **Step 1: Failing test.** `createLabelLayer(host)` appends one `div.viz-labels` to `host`; `set("a", "x1", [0, 0, 0], "node")` creates a span with class `node` and text "x1"; an `op` label's transform uses `translate(-50%, -50%)`; `set` again with new text updates in place (same element); `remove("a")` deletes it; `update(camera, 200, 200)` with a `PerspectiveCamera` at (0, −10, 0) looking at the origin (Z-up) puts the origin's span at translate(100px, 100px) (parse the `transform` style) and a point behind the camera (0, −20, 0) gets `hidden = true`; a point projecting outside the canvas is hidden; `clear()` removes every span; `dispose()` removes the div. Also a pure `projectToPixels(world, camera, w, h): [x, y] | null` used by `update`, tested on its own with two known points.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement** per spec §5 "Labels": the div is `position: absolute; inset: 0; overflow: hidden; pointer-events: none; user-select: none` (CSS in `styles/panel.css` next to `.canvas-hint`), spans `position: absolute; left: 0; top: 0; transform: translate(-50%, -100%) translate(xpx, ypx); white-space: nowrap; font: 12px var(--mono)`; kinds `node` (`color: var(--ink)`), `op` (`--ink`, centred on the sphere), `value` (`--soft`), `grad` (`--accent`), `edge` (pill: `background: var(--bg); border: 1px solid var(--line); padding: 0 4px; border-radius: 3px`). Tokens `--mono`, `--ink`, `--soft`, `--accent`, `--bg`, `--line` exist in `styles/tokens.css`. `update` reuses one `Vector3` and writes `style.transform` only when the rounded pixel position changed.
- [ ] **Step 4:** Run, `pnpm check`; commit "Add an HTML label overlay projected from world points".

### Task 3: State and layout

**Files:** create `src/viz/backprop/state.ts`, `src/viz/backprop/layout.ts`; tests `tests/viz/backprop/state.test.ts`, `tests/viz/backprop/layout.test.ts`.

- [ ] **Step 1: Failing tests** (spec §4, §6). Layout: `layoutGraph(GRAPHS.neuron)` gives 5 distinct X columns evenly placed in [−5, 5] (X = −5 + (depth + 0.5)·2), leaf column: declaration order x1, w1, x2, w2, b maps to decreasing Z (x1 at 5.2, b at 0.8), `o` at (4, 3); every edge goes to a strictly greater X; no two nodes share a position; `product-sum` has 3 columns. State: `initialState()` (neuron, leaves = starts, step 0, playing false, show all true); `setGraph` resets leaves/step/playing; `setLeaf` clamps to the leaf's range and keeps step; `stepForward` increments to the pass length then stops and clears `playing`; `resetPass`; `setPlaying` (no-op when done); `setShow`; `reset`; `derived` at initial state: `values` equals `forward`, `grads` is empty (no backward step yet), `steps.length` 10, `current` null, `phase` "idle", `done` false; after 3 steps `phase` "forward", `current` is `steps[2]`; after 6 `phase` "backward" and `grads` has exactly keys {o, n}; after 10 `done` true, `phase` "done", `grads` equals `backward`.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement** `layout.ts` (`depthOf` = longest path from a leaf; columns; rows ordered by mean input Z, leaves by declaration order; export `WALL_W = 10`, `WALL_H = 6`, `Z_RANGE = [0.8, 5.2]`) and `state.ts` (`BpState`, `ShowKey`, reducers, `Derived` with `graph, values, revealed, grads (= gradsAfter(graph, values, revealed.backwardSteps)), steps, current, done, phase`). Export `STEP_MS = 700`.
- [ ] **Step 4:** Run, `pnpm check`; commit "Add backprop scene state and the column layout".

## Chunk 2: Scene objects

### Task 4: Wall, framing, edges

**Files:** create `src/viz/backprop/frame-wall.ts`, `src/viz/backprop/wall.ts`, `src/viz/backprop/edges.ts`; tests `tests/viz/backprop/frame-wall.test.ts`, `tests/viz/backprop/edges.test.ts`.

- [ ] **Step 1: Failing tests.** `frameWall()` → target (0, 0, 3), position target + 12·(0.55, −1.05, 0.5) = (6.6, −12.6, 9), +x −y +z octant. Edges: `edgeSegments(graph, layout)` (pure, exported) returns one world segment per (input → node) edge, endpoints at the two node positions lifted 0.01 toward −y (y = −0.01), neuron has 9 edges (x1→x1w1, w1→x1w1, x2→x2w2, w2→x2w2, x1w1→sum, x2w2→sum, sum→n, b→n, n→o); `activeEdgeSegments(graph, layout, node)` returns only the edges into `node`; `shared-node` has 6 edges (ab: a, b; e: ab, c; f: e, c; L: f, e).
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement.** `wall.ts` `createWall(theme)` → `{ group, mesh, dispose }`: `PlaneGeometry(10, 6)` rotated to y = 0 centred (0, 0, 3) (`rotation.x = π/2`, as chain-rule `faces.ts`), material as spec, plus an outline `{ depth: true }` layer of the four edges (`--line`). `edges.ts` `createEdges(theme)` → `{ group, set(graph, layout), setActive(graph, layout, node | null), dispose }` with two `{ depth: true }` layers (all edges `--line` order 2; active `--accent` order 3, opacity 1), written with `writeWorldSegments`; buffers sized for 24 endpoints (enough for the largest preset, 9 edges = 18 endpoints; assert in DEV).
- [ ] **Step 4:** Run, `pnpm check`; commit "Add the backprop wall, framing and edge layers".

### Task 5: Nodes and bars

**Files:** create `src/viz/backprop/nodes.ts`, `src/viz/backprop/bars.ts` (+ `bars-geometry.ts` if needed); tests `tests/viz/backprop/bars.test.ts`.

- [ ] **Step 1: Failing tests** (pure parts): `barTransform(kind, value, revealed)` → `{ length: number; centreY: number; visible: boolean }` with length = min(3, s·|v|) (s_value 0.3, s_grad 1.5), centreY = −length/2 for v ≥ 0 and +length/2 for v < 0 (positive comes out toward −y, the camera side), visible false when not revealed; `ease(t)` = 1 − (1 − t)³ with ease(0) = 0, ease(1) = 1; an `Eased` helper (`target`, `current`, `advance(dt, durationMs)`) that reaches its target within the duration and jumps instantly when `instant` is true.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement.** `nodes.ts` `createNodes(theme)` → `{ group, set(graph, layout, revealedValues: ReadonlySet<string>), dispose }`: spheres per spec (leaves `--ink` r 0.16, ops `--soft` r 0.14, output `--accent` r 0.16, `MeshStandardMaterial({ roughness: 0.5, transparent: true })`, opacity 1 when revealed else 0.35; renderOrder 10); meshes are created per graph in `set` (dispose old ones on graph change; share one geometry per radius). `bars.ts` `createBars(theme, reducedMotion)` → `{ group, hitTargets: Mesh[] (one invisible `BoxGeometry(0.4, 6.4, 0.4)` per leaf centred at (X_i − 0.12, 0, Z_i), so it spans y ∈ [−3.2, 3.2] and a zero-valued leaf is still grabbable), leafIds: string[], set(graph, layout, values, grads, revealed, show), update(dt): boolean (advances eased lengths; returns true while any bar is still moving), dispose }`: two `BoxGeometry(0.16, 1, 0.16)` meshes per node at X ∓ 0.12, scaled in y to the eased length and positioned at centreY; value `--soft`, grad `--accent`; `visible` from `show` and revealed. On a leaf edit (value changed while already revealed) the bar jumps instantly; on reveal it eases (spec §5). Hit boxes are fixed; they do not follow the bar length.
- [ ] **Step 4:** Run, `pnpm check`; commit "Add backprop nodes and eased value/gradient bars".

## Chunk 3: Panel, assembly, registry, docs

### Task 6: Explanation and panel

**Files:** create `src/viz/backprop/explanation.ts`, `src/viz/backprop/panel.ts`, `src/viz/backprop/panel-leaves.ts`; tests `tests/viz/backprop/explanation.test.ts`, `tests/viz/backprop/panel.test.ts` (jsdom).

- [ ] **Step 1: Failing tests.** `stepText(d)` (pure): at step 0 "Leaves are given; press Step to run the forward pass."; forward step of `x1w1` → "forward: x1·w1 = 2 × −3 = −6" (label, the op applied to the input values, the result via `proseNum`); forward of `n` → "forward: n = −6 + 6.881 = 0.8814"; forward of `o` → "forward: o = tanh(0.8814) = 0.7071"; backward of `o` → "backward at o: o.grad = 1 → n.grad += 0.5 × 1"; backward of `n` (add) → "backward at n: n.grad = 0.5 → sum.grad += 1 × 0.5, b.grad += 1 × 0.5"; done → "Pass complete."; `edgeLabel(graph, node, inputIndex, values)` → "× −3" etc. Panel: graph select (three titles, `onGraph`); Step / Play–Pause / Reset pass buttons call `onStep`, `onPlay(on)`, `onResetPass`, and the Play button's label reads "Pause" when `state.playing`; leaf sliders rebuilt on graph change (5 for neuron, 3 for product-sum), each calls `onLeaf(id, v)` and reflects `state.leaves` on render without firing; Reset / Reset view; toggles Value bars / Grad bars / Edge derivatives → `onShow`; readouts: output row and one row per leaf with value and grad ("—" until revealed); the pass line "Step k of N: …"; equations via `createEquation` re-render only on graph change.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement** per spec §7; `panel-leaves.ts` owns the slider section (`createLeafSliders(section, graph, onLeaf)` → `{ render(leaves), dispose }`), rebuilt by `panel.ts` when the graph key changes. Use `createSlider` (linear) from `src/ui/slider.ts` if present, else check what linear slider the ui has (the derivative uses `createLogSlider`; gradient-descent may have a linear one). Step 0.01.
- [ ] **Step 4:** Run, `pnpm check`; commit "Add the backprop panel and explanation".

### Task 7: Assembly

**Files:** create `src/viz/backprop/index.ts`; test `tests/viz/backprop/index.test.ts`.

- [ ] **Step 1: Failing test** (copy `tests/viz/chain-rule/index.test.ts`): metadata (id "backprop-graph", topic "machine-learning", title "Backprop graph", summary exactly as spec §9); first update renders, then idles; clicking Step advances the pass line to "Step 1 of 10"; Play then `update(0.8)` advances a step and `update(0.1)` does not; theme listener removed; hint `ai-lab.hint.backprop`; drag listeners removed and panel emptied on dispose; the label layer div is removed on dispose.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement** mirroring `src/viz/chain-rule/index.ts`: `buildScene` (kit, wall, edges, nodes, bars, labels), `home = frameWall()`, `apply(next)`: derived → if graph changed: `edges.set`, `nodes.set`… (edges/nodes/bars all take the graph and layout each apply; they rebuild only on graph change internally) → `edges.setActive(current?.node ?? null)` → `nodes.set(revealed.values)` → `bars.set(values, grads, revealed, show)` → labels: node labels for every node (plus `op` symbols centred on op spheres), value labels at value-bar tips (revealed and show.values), grad labels at grad-bar tips (revealed and show.grads), edge labels for the current backward step's input edges when `show.edgeDerivs` (removed otherwise) → `panel.render` → `dirty = true`. `update(dt)` (dt in seconds, as `core/loop.ts` passes it; check): `controls.update`; if `state.playing`, accumulate dt and `apply(stepForward(state))` every `STEP_MS`; `bars.update(dt)` → dirty while easing; when dirty, the camera moved, or `resize` ran since the last frame, `labels.update(camera, w, h)` (w/h kept from `resize`, CSS pixels) and render. The label div is created before `createUsageHint` so the hint stays on top. One `attachDrag`: `hitTargets: bars.hitTargets`, a plane containing the bar's axis and facing the camera: `plane: { normal: (i) => new Vector3(camera.position.x − X_i, 0, camera.position.z − Z_i).normalize() (written into a reused module Vector3), getOffset: (i) => that normal · (X_i − 0.12, 0, Z_i) }` (`attachDrag` calls `normal(i)` before `getOffset(i)` at pointerdown; verify the order in drag.ts and if `getOffset` runs first, compute both inside one helper called from `normal`), `onDrag(i, p)` → `apply(setLeaf(state, leafIds[i], −p[1] / S_VALUE))` (setLeaf clamps). Hint lines from spec §8. `resize(w, h)` stores w/h, updates the camera aspect and marks labels dirty. Dispose order: theme listener → drag → hint → labels → bars, nodes, edges, wall → `disposeObject(kit.scene)` → `kit.dispose()` → panel.
- [ ] **Step 4:** Run, `pnpm check`; commit "Assemble the backprop graph scene".

### Task 8: Registry, README, merge

**Files:** modify `src/app/registry.ts`, `tests/app/registry.test.ts`, `README.md`; add `docs/screenshots/backprop-{light,dark}.png` (coordinator, via the Chrome MCP).

- [ ] **Step 1:** Registry entry `backprop-graph` → `status: "ready"`, `load: () => import("../viz/backprop").then((m) => m.backpropGraph)`, summary from spec §9; in the registry test remove it from `roadmapExpectations` and add a `loadReady("machine-learning", "backprop-graph")` case.
- [ ] **Step 2:** `pnpm build`; separate `backprop-*.js` chunk; entry chunk within a few hundred bytes of `main`.
- [ ] **Step 3:** README: "Five scenes so far", a paragraph for the backprop graph after the chain rule one, screenshot line, roadmap item 2 struck through with a one-line description.
- [ ] **Step 4:** Commit "Register the backprop graph; README".
- [ ] **Step 5 (coordinator):** Chrome pass: step through the neuron, drag w1 and check the readouts, each preset, both themes, orbit with labels tracking, console clean; save screenshots; tune the camera within the octant if needed (update frame test + spec). Final integrated review; fast-forward merge; push; verify the live site.
