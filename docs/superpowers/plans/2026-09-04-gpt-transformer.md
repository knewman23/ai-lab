# GPT Transformer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-trainual:subagent-driven-development (if subagents available) or superpowers-trainual:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `machine-learning/gpt-transformer`: a real one-block GPT at `d_model = 2` — eight vocabulary words as draggable points on the floor, the pipeline (embed + position → 2 heads → residual → MLP → logits) on a wall in front of them, attention arcs for one selected query token, and a tied unembedding that makes the words you drag double as the output directions.

**Architecture:** As the six existing scenes: pure tested math (`core/math/transformer.ts`), a pure layout and a pure reducer (`viz/gpt/{layout,state}.ts`) driving Three.js objects that only read state. `forward` returns every quantity the panel displays — nothing is recomputed scene-side (spec §3.8), which is the rule that closed two of the spec's seven review issues. Column selection needs a *click* on a wall target, which `shared/drag.ts` does not offer (it fires `onDrag` only on pointermove, and click-to-place only for a missed hit on the surface), so a small scene-local `column-pick.ts` owns that raycast; `shared/` is not modified.

**Tech Stack:** Vite 8 (Rolldown), strict TypeScript (`noUncheckedIndexedAccess`), three 0.185, KaTeX, vitest (jsdom for DOM). Branch `gpt-transformer` off `main` (already created); fast-forward merge at the end.

**Spec:** `docs/superpowers/specs/2026-09-04-gpt-transformer-design.md` (approved, four review rounds; wins over this plan).

**Reference implementation:** `docs/superpowers/specs/2026-09-04-gpt-transformer-reference.mjs`. Run it with `node` before writing Task 1's fixtures. **Every number in the spec came from it, and three rounds of review turned on numbers that had been asserted from intuition.** If your implementation disagrees with the spec, run the reference first — but if the reference disagrees with your implementation, the reference is not automatically right either: it is a second opinion, not an oracle. Reconcile before moving on, and if the spec is wrong say so rather than bending the test.

**Conventions for every task:** `pnpm check` green before committing; commit with `git commit --only <paths>` (never `-a`); check `git show --stat HEAD`; trailer `Claude-Session: https://claude.ai/code/session_01NL7fLdagpFezkhQfNxt2CL` on its own line after a blank line; no hard-coded colours; subscribe to theme `"change"` and re-copy `Color`s; every listener and GPU resource disposed; scene objects detach before the assembler's `disposeObject(scene)`; files under ~160 lines (split pure geometry from Three wrappers as the backprop and chain-rule scenes do); read vitest results with `rtk proxy pnpm vitest run <path>`. Copy patterns from `src/viz/nn/` (closest sibling: wall + floor split, label overlay, `apply` shape, dispose order, DEV budget warning) and `src/viz/backprop/` (hit boxes, stage readouts).

**Files:**

```
src/core/math/transformer.ts                      + tests/core/math/transformer.test.ts
src/viz/gpt/
  layout.ts  state.ts  frame-gpt.ts
  arrow-head.ts  pass-read.ts                        shared within the scene (see below)
  wall-bands.ts  columns-geometry.ts  columns.ts  column-pick.ts
  arcs-geometry.ts  arcs.ts
  bars-geometry.ts  bars.ts
  floor-embed-geometry.ts  floor-embed.ts
  residual-path-geometry.ts  residual-path.ts
  panel.ts  panel-readouts.ts  explanation.ts  labels-sync.ts  index.ts
tests/viz/gpt/    one per source module above, plus helpers.ts (the shared test theme)
src/app/registry.ts, tests/app/registry.test.ts
README.md, docs/roadmap.md, docs/screenshots/gpt-transformer-{light,dark}.png
```

---

## Chunk 1: Math, layout and state

### Task 1: The forward pass

**Files:** create `src/core/math/transformer.ts`; test `tests/core/math/transformer.test.ts`.

- [ ] **Step 1: Run the reference.** `node docs/superpowers/specs/2026-09-04-gpt-transformer-reference.mjs`. Keep its output beside you; Steps 3 and 5 are checked against it.

- [ ] **Step 2: Failing tests** (spec §3, §9). Write all twelve of spec §9's `transformer.test.ts` cases. The ones that carry the design, and the exact expected values:
  - Rows sum to 1 within 1e-12 for both heads, all three sequences, all three presets.
  - With `causal: true`, row `i` has exactly `i + 1` entries; with `causal: false`, every row has five and still sums to 1.
  - Positional encoding off: the two `the` positions in `cat-sat` have bit-identical `q`, `k` and `v` in **both** heads — **and on: they differ.** Both halves are required; with only the "off" half, a `forward` that ignored `positional` entirely would still pass.
  - Weight tying: `logits[v] === dot(xFinal[4], embeddings[v])` for all eight `v`.
  - Hand-computed fixture: two positions, head 1 only, embeddings `(1,0)` and `(0,1)`, positional encoding off, to 1e-12.
  - **§1.3** `collapsed` + positional on, **all three sentences**: head 1's last-row argmax is 3 and its margin over the runner-up is ≥ 0.03 (measured 0.063, 0.063, 0.036 — the bound is 0.03, *not* 0.05, and the test must loop the sentences). On `cat-sat` the row equals `[0.115, 0.144, 0.223, 0.290, 0.227]` to 1e-3.
  - **§1.4** `collapsed` + positional **off**, **all three sentences**, both heads, every row: within 0.01 of `1/(i+1)`. Loop the sentences — a `cat-sat`-only test passes at 1.7e-3 and never sees `dog-ran` head 2 row 1's 3.02e-3.
  - **§1.5** `tuned` + positional on: head 1's last-row argmax is 1, 0, 0 for `cat-sat`, `dog-ran`, `scrambled` — and is never 3. This is the test that pins "content beats position at `d_model = 2`"; without it the spec's central lesson is unenforced.
  - Change-detector: `PE_SCALE`, `W_Q`, `W_K`, `W_V`, `W_O`, `W1`, `b1`, `W2`, `b2` equal spec §3's values exactly.
  - `probabilities(logits, T)` sums to 1 for `T` in `{0.2, 1, 3}`, preserves the logit order, and concentrates more mass on the argmax at low `T` than at high `T`.
  - Determinism: two `forward` calls on equal inputs return equal numbers.

- [ ] **Step 3: Run tests to verify they fail.** Run: `rtk proxy pnpm vitest run tests/core/math/transformer.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 4: Implement** per spec §3. Export `VOCAB`, `SEQUENCES`, `EMBEDDING_PRESETS`, `PE_SCALE`, the weight constants, `forward(input: ForwardInput): Forward` and `probabilities(logits, T)`. Notes that will otherwise cost a round:
  - The softmax is the stable form (subtract the row max before exponentiating), so a one-entry masked row gives exactly 1.
  - Masked positions are **absent** from `scores`/`weights`, never present-and-zero and never `-Infinity` — §5.4 draws its `×` markers from the row's length, so nothing downstream may see a sentinel.
  - `Forward` must return `pe`, `mlpHidden` and `logits` as well as the stream states. They exist because §7's readout displays them and §1.2 forbids the scene recomputing anything.
  - `collapsed` and `spread` are circles of radius 0.1 and 1.8 at `k · 45°`; `collapsed` is 0.1 rather than 0 so the eight floor points stay separately draggable.

- [ ] **Step 5: Run tests to verify they pass.** Run: `rtk proxy pnpm vitest run tests/core/math/transformer.test.ts`. Expected: PASS. Then re-run the reference script and confirm your numbers match its output line for line.

- [ ] **Step 6: Commit.**
```bash
pnpm check
git commit --only src/core/math/transformer.ts tests/core/math/transformer.test.ts -m "Add a one-block GPT forward pass at d_model = 2"
git show --stat HEAD
```

### Task 2: Layout, framing and state

**Files:** create `src/viz/gpt/layout.ts`, `src/viz/gpt/frame-gpt.ts`, `src/viz/gpt/state.ts`; tests `tests/viz/gpt/{layout,frame-gpt,state}.test.ts`.

- [ ] **Step 1: Failing tests** (spec §4, §5.9, §6). Layout: exports `WALL_W = 6`, `WALL_H = 5.2`, `WALL_OPACITY = 0.18`, column x `[-2.4, -1.2, 0, 1.2, 2.4]`, band z `{ embed: 0.5, attention: 1.5, residual: 2.5, mlp: 3.4, logits: 4.2 }`; `floorFromEmbed`/`embedFromFloor` round-trip to 1e-12 over the domain corners and centre; `embedFromFloor` clamps a point outside the floor into `[-2, 2]²`; `glyphLength` is 0 at 0, is strictly increasing over 0 to 20 (well past the 5.63 the scene produces), and never exceeds 0.55 for magnitudes up to 100 — so no arrow can reach the neighbouring column at the 1.2 pitch. Note `Math.tanh` saturates to exactly 1 in float64 from about 38, so `glyphLength(40) === 0.55`; the requirement is the bound, not strictness. Those three are the properties spec §9 requires and the ones that must survive. Additionally, as a **calibration check rather than a property**, it gives 0.3652 at 1.6, 0.4739 at 2.6 and 0.5459 at 5.6 to 1e-3; if the curve is ever retuned these three are expected to break and should be re-derived. (Spec §4's prose said 0.44 at 2.6; that was wrong and is corrected there too.) Framing: `frameGpt()` returns a `Framing` in the −y, +z octant whose target sits between the wall centre and the floor's near edge. State: `initialState()` is `cat-sat` / `tuned` / query 4 / head `both` / stage `all` / `T = 1` / positional, causal and residual-path all on; every setter is pure and returns a new object; `setQuery` rejects an index outside `0..4`; `setEmbedding(v, p)` changes only entry `v`; `resetEmbeddings` restores the current preset; `setPreset` replaces all eight; `derived(state)` returns `forward(...)` plus `probabilities(...)` at the current `T`; and — the spec §9 case that pins the toggle wiring — `derived(setCausal(s, false))` has five entries in every attention row where `derived(s)` had `i + 1`, proving the toggle reaches `ForwardInput` rather than stopping at the panel.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement.** `layout.ts` is pure and imports nothing from three. `state.ts` mirrors `src/viz/nn/state.ts` in style. Note the split the nn scene also makes: temperature is **not** an input to `forward`, so `setTemperature` must not invalidate a cached forward pass — keep `derived` cheap enough that the assembler can call it per apply, and let Task 7 decide what to memoise.
- [ ] **Step 4:** Run, `pnpm check`; commit "Add GPT transformer layout, framing and scene state".

---

## Chunk 2: Scene objects

### Task 3: Bands, columns and column picking

**Files:** create `src/viz/gpt/wall-bands.ts`, `src/viz/gpt/columns-geometry.ts`, `src/viz/gpt/columns.ts`, `src/viz/gpt/column-pick.ts`; tests `tests/viz/gpt/{wall-bands,columns-geometry,columns,column-pick}.test.ts`.

- [ ] **Step 1: Failing tests** (spec §5.2, §5.3). Bands: five horizontal lines across the wall at the band z values in `--soft`; `setFocus("mlp")` leaves the MLP band at full opacity and drops the other four to 0.25; `setFocus("all")` restores all five; theme change recolours; dispose releases the layer. Columns: five vertical lines from the embed band to the MLP band; `set(forward)` puts a glyph on **five** bands per column — `x`, `attnOut`, `xResid`, `mlpOut`, `xFinal` — each an arrow from the band point along the vector's direction at `glyphLength(|v|)`; the `attnOut` and `mlpOut` glyphs (the two **deltas**) use an open arrowhead and the three stream states a closed one, so the two kinds never look alike; `setQuery(2)` draws column 2 in `--accent` and the rest in `--ink`; dispose releases shared geometries and materials. Picking: `createColumnPick({ canvas, camera, targets, onSelect })` calls `onSelect(i)` for a pointerdown/pointerup pair within 6 px and 400 ms over target `i`, does **not** fire when the pointer moved further than that (an orbit), does not fire when the ray misses every target, and detaches cleanly.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement.** Split the columns the way Task 4 splits the arcs: `columns-geometry.ts` is pure (given a vector and a band, where does the arrow start, end and how long is it — `glyphLength` applied, both arrowhead kinds) and `columns.ts` is the thin Three wrapper over it. Five columns × five glyphs × two arrowhead kinds plus selection colouring, theme and dispose will not fit one readable file otherwise. `wall-bands.ts` and `columns.ts` use the preallocated `shared/layer.ts` LineSegments layers; call `commit()` so a layer with zero endpoints hides (WebGPU warns on zero-vertex draws). `column-pick.ts` copies the click-detection constants and the capture-phase listener order from `shared/drag.ts` (`CLICK_SLOP_PX = 6`, `CLICK_MS = 400`, `pointerdown` registered with `true` so the hit test runs before OrbitControls'), and the invisible-material-on-a-visible-mesh recipe plus the `ACTIVE_LAYER`/`PARKED_LAYER` trick from `src/viz/backprop/hit-boxes.ts` — three's `Raycaster` tests layers, not `visible`.
- [ ] **Step 4:** Run, `pnpm check`; commit "Add the GPT transformer's stage bands, token columns and column picking".

### Task 4: Attention arcs

**Files:** create `src/viz/gpt/arcs-geometry.ts`, `src/viz/gpt/arcs.ts`; tests `tests/viz/gpt/{arcs-geometry,arcs}.test.ts`.

- [ ] **Step 1: Failing tests** (spec §5.4). Geometry (pure, no three): endpoints land exactly on the two columns' band points at `z_attn`; the control-point lift is `0.25 + 0.35·|Δx|` and grows with `|Δx|`; half-width is `0.010 + 0.075·weight`, monotone in the weight and positive at weight 0; the triangle winding is consistent for a left-to-right and a right-to-left arc (this is the WebGPU `DoubleSide` trap — never negate normals, three multiplies by `faceDirection`); a zero-arc call produces zero vertices. Arcs: `set(forward, query, head)` emits one ribbon per visible key; `head: "both"` uses the blend `0.6·a¹ⱼ + 0.32·a²ⱼ` — **not** `0.6a¹ + 0.4a²`, because head 2's `W_V = 0.8I` shrinks its values before `W_O` mixes them, and the blend sums to 0.92 rather than 1; `setFocus("scores")` switches half-width to the min-max-normalised raw score and shows a `×` marker at each masked `j > i`; every arc is offset −0.06 in y so it floats in front of the wall and never z-fights; geometry is preallocated for five arcs and the unused tail collapses to zero length; dispose releases geometry and material.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement.** 24 segments per quadratic Bézier, emitted as a triangle strip into a preallocated `Float32Array` whose length is a multiple of 3 (reading past the end makes `computeBoundingSphere` return NaN in this codebase). `MeshStandardMaterial`, `DoubleSide`, `--accent`. Derive the masked positions from the row's **length**, per Task 1's contract — there is no sentinel to look for.
- [ ] **Step 4:** Run, `pnpm check`; commit "Add the GPT transformer's attention arcs".

### Task 5: Floor, residual path and probability bars

**Files:** create `src/viz/gpt/floor-embed.ts`, `src/viz/gpt/residual-path.ts`, `src/viz/gpt/bars.ts`; tests `tests/viz/gpt/{floor-embed,residual-path,bars}.test.ts`.

- [ ] **Step 1: Failing tests** (spec §5.5–§5.7). Floor: a plain `--faint` rectangle spanning x ∈ [−3, 3], y ∈ [−6, 0] (apply `matrixWorld` to a geometry clone and check the `Box3`, as the wall test does); eight `--ink` spheres of radius 0.09 at `floorFromEmbed(embeddings[v])`, each a drag hit target; a thin `--soft` ray from `floorFromEmbed(0,0)` through each point to the floor edge, with the highest-probability word's ray in `--accent`; theme change recolours; dispose releases geometries and materials. Residual path: for the selected query, three chained arrows — embedding → `x` (`--soft`, "+ position"), `x` → `xResid` (`--accent`, "+ attention"), `xResid` → `xFinal` (`--ink`, "+ MLP") — at **true relative length**, not normalised, and a hollow ring at `xFinal`; `setShow(false)` hides the group. Bars: eight bars across the logits band in vocabulary order, each 0.28 wide with height `0.55 · p / max(p)` so the tallest always fills the band; a leader line from the top of column 4 to the row; dispose releases geometry and material.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement** per spec §5. Two notes the spec calls out: the floor is deliberately *not* a vertex-coloured field (there is no scalar field here, so the nn scene's field-versus-points colour clash does not arise); and the residual path's attention arrow is usually but **not always** longer than the MLP arrow — `|mlpOut|/|attnOut|` ranges 0.07 to 1.47, so do not normalise the pair to force long-then-short. Bars top out at `4.2 + 0.55 = 4.75`, inside `WALL_H = 5.2` with room for the label pill.
- [ ] **Step 4:** Run, `pnpm check`; commit "Add the GPT transformer's embedding floor, residual path and probability bars".

---

## Chunk 3: Panel, assembly, registry

### Task 6: Explanation and panel

**Files:** create `src/viz/gpt/explanation.ts`, `src/viz/gpt/panel.ts`, `src/viz/gpt/panel-readouts.ts`; tests `tests/viz/gpt/{explanation,panel}.test.ts`.

- [ ] **Step 1: Failing tests** (spec §6, §7). Readouts: `panel-readouts.ts` gets its own test with **one assertion per §7 stage row** — all eight, not a sample. §7's table is where §1.2 ("every number on screen comes from `forward`") is actually enforced, and it is enforced nowhere else in the suite. Panel: the eight control clusters in spec §6's order (sentence, embeddings + reset, query token, head, stage, temperature, the three toggles, reset view), each firing its callback with the right value; the `collapsed` preset's hint line appears under the select when that preset is chosen; the temperature slider is logarithmic over `[0.2, 3.0]` and formats through the shared `proseNum`; `render(state, derived)` writes the §7 readout row for the focused stage — including the raw score row with masked entries shown as `—`, and the top-3 next tokens — and dedupes identical TeX through `createEquation`. Explanation: asserts the five topics of spec §7 are present.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement.** Use the `src/ui/` widgets (`select`, `slider`, `toggle`, `button`, `equation`, `readout`) exactly as `src/viz/nn/panel.ts` does.

  **The explanation copy is load-bearing and gets written with the same care as the math** (spec §7). Three properties of this scene are true, visible on screen, and actively misleading if unexplained:
  1. Head 1 is previous-position-*biased*, not the previous-token head its `R(-1)` rotation suggests — at `tuned`, content wins. The copy must name `collapsed` as the preset that shows the bias on its own.
  2. The block predicts `the` at 0.79 — the token it just read. That is what an untrained tied-unembedding block does, and a trained `W_O` and MLP are exactly what break it.
  3. A tied unembedding makes a word's bar grow when it is dragged *further out*, not only when it is dragged *toward* the final vector.

  Also cover why layer norm is absent (at `d_model = 2` it leaves only `±(1, -1)`, collapsing every token onto two points) and that there is no training here, linking to the neural network scene.
- [ ] **Step 4:** Run, `pnpm check`; commit "Add the GPT transformer panel, readouts and explanation".

### Task 7: Assembly

**Files:** create `src/viz/gpt/index.ts`, `src/viz/gpt/labels-sync.ts`; test `tests/viz/gpt/index.test.ts`.

- [ ] **Step 1: Failing tests.** `labels-sync.ts` gets its own test asserting all five of spec §5.8's label families are present — band names, the five sequence words, the eight vocabulary words, the eight bar labels and the three residual-path labels — because nothing else pins that set. Then: `mount(host)` builds and returns a `VizInstance` whose `id` is `"gpt-transformer"`, `topic` is `"machine-learning"`, `title` is `"GPT transformer"` and whose `summary` is exactly this string — Task 8 copies the same one into the registry, and `loadReady` asserts the two are equal, so a paraphrase here fails that test:

  > Drag eight word embeddings across the floor and watch one transformer block respond: attention arcs between the tokens, the residual stream, and the probability of every next word.

  Then: `mount(host)` builds and returns a `VizInstance`; `dispose()` releases every listener and GPU resource (follow the nn scene's high-water-mark geometry check); a throw partway through the build unwinds in reverse order and leaks nothing; `resize` updates the camera aspect; `update` returns false once the scene is still and the camera has stopped damping.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement**, copying `src/viz/nn/index.ts`'s `buildScene`/`unwind`/`apply` shape and dispose order. Two scene-specific points:
  - Build the wall explicitly: `createWall(theme, { width: WALL_W, height: WALL_H, opacity: WALL_OPACITY })` from `src/viz/shared/wall.ts`. No other task creates it, and per the repo's readability note lines drawn on it use `--soft`, never `--line`.
  - **Expect size pressure and split early.** `src/viz/nn/index.ts` is already 298 lines against the ~160 convention, and this assembler carries two pointer mechanisms, eight control clusters and the stage-focus fan-out. If `index.ts` passes ~200 lines, lift the stage-focus fan-out (which object dims for which stage) into its own pure module rather than letting the assembler grow.
  - **Call `panel.render` after a column click.** The query select syncs from state only, so §6.3's "kept in sync with clicking a column" holds only if the assembler re-renders the panel after `column-pick` fires. (Flagged by Task 6.)
  - **Pass `floor.mesh` as `surfaceTarget`, never `floor.group`.** Task 5 deliberately made the eight draggable word spheres *siblings* of the bare plane rather than its children, and pinned that with a test, precisely so the recursive raycast below cannot reach them. Passing the group would undo that and swallow click-to-place.
  - **The column hit meshes must not live under the floor's surface group.** `shared/drag.ts:204` raycasts `surfaceTarget` *recursively*, and the hit boxes are layer-0 meshes with an invisible material — parented under the floor they would swallow click-to-place. Keep them in their own group. (Found during Task 3's review.)
  - Two pointer mechanisms coexist: `attachDrag` for the eight floor points (plane z = 0, `surfaceTarget` the floor) and Task 3's `column-pick` for the five wall columns. Both are detached in `dispose`.
  - Recompute policy: the forward pass is tiny, so `apply` may run it every time — but `setTemperature` must only re-run `probabilities`, never `forward`. Add the nn scene's DEV budget warning at 4 ms per apply (spec §1.7).
  - `labels-sync.ts` rebuilds the overlay only when the label *set* changes and re-projects whenever the camera moved, the canvas resized, or the scene is dirty.
- [ ] **Step 4:** Run, `pnpm check`; commit "Assemble the GPT transformer scene".

### Task 8: Registry, docs, browser validation, merge

**Files:** modify `src/app/registry.ts`, `tests/app/registry.test.ts`, `README.md`, `docs/roadmap.md`; add `docs/screenshots/gpt-transformer-{light,dark}.png`.

- [ ] **Step 1: Registry.** Change the `gpt-transformer` entry from `status: "soon"` to `status: "ready"` plus `load: () => import("../viz/gpt").then((m) => m.gptTransformer)`, and replace its `summary` **verbatim, in both the registry and `viz/gpt/index.ts`**, with:

  > Drag eight word embeddings across the floor and watch one transformer block respond: attention arcs between the tokens, the residual stream, and the probability of every next word.

  The current summary describes a scene with no draggable floor and no tied unembedding, and `loadReady` asserts the module's `summary` equals the entry's.

- [ ] **Step 2: Fix the registry test — this scene empties the roadmap.** `gpt-transformer` is the **last** `status: "soon"` entry, so the `roadmapExpectations` array (`tests/app/registry.test.ts:28-41`) becomes `[]` and vitest throws on `it.each([])`. **Delete the array and its `it.each` block outright** — do not just remove the row. Then add a sixth loader case beside the others:
  ```ts
  it("loads the GPT transformer from its own chunk", async () => {
    await loadReady("machine-learning", "gpt-transformer");
    const summary = findEntry("machine-learning", "gpt-transformer")?.summary;
    expect(summary).not.toContain("roadmap");
    expect(summary).not.toContain("soon");
  });
  ```

- [ ] **Step 3: Run the full suite.** Run: `rtk proxy pnpm vitest run`. Expected: PASS, no `it.each([])` error.

- [ ] **Step 3a: Look at the `collapsed` preset specifically.** Its eight words sit on a floor circle of radius 0.14, about 0.107 apart — so the visible 0.09 spheres already overlap there, and Task 7's 0.19 pick volumes overlap more. Picking stays deterministic (the raycaster returns nearest-first), so this is a legibility question, not a correctness one. If it reads badly, widen that preset's radius; do **not** shrink the pick volumes, which exist because a 0.09 target is too small to grab.

- [x] **Step 3b: off-floor `xFinal` — SETTLED as option (a), leave the geometry true.** Measured in the browser and against the reference: the residual path's embedding-y reaches **4.61** across presets, sentences and toggles, with a 99th percentile of 4.14. No floor mapping holds that. Centre −4.2 with scale 1.0 still puts the p99 at the wall and the maximum behind it, and it shrinks the word cloud from 5.6 floor units to 4.0, making the eight words harder to tell apart in exchange for a case it still does not fix. Options (b) and (c) are therefore dead: (b) is arithmetically impossible, and (c) would introduce a boundary marker — a second concept to explain — for a path that is already visible, since the wall is translucent at 0.18 and the path reads *through* it rather than vanishing behind it.

  What actually made that area unreadable was label collision, not the path (see Step 3c). §5.7's true relative length stands, defended by four tests.

- [ ] **Step 4: Browser validation** (required before merge — see the owner's standing instruction). `pnpm dev`, then via the Chrome DevTools MCP: open `#/machine-learning/gpt-transformer`; screenshot light and dark into `docs/screenshots/`; drag a vocabulary word and confirm the bars respond; click each column and confirm the arcs move; step the stage selector through all eight values; toggle positional encoding off and confirm the two `the` columns' glyphs collapse together; toggle the causal mask off and confirm the last row widens to five arcs; switch to `collapsed` and confirm head 1's thickest arc is the one to the preceding column; confirm the console is clean. If Chrome refuses with "browser already running", kill processes using `user-data-dir=~/.cache/chrome-devtools-mcp`, remove the profile's `Singleton*` files and retry.

- [ ] **Step 5: Docs.** Move the scene from in-flight to live in `README.md` and `docs/roadmap.md` (its "In flight" list drops to walkthrough mode alone).

- [ ] **Step 6: Commit and merge.**
```bash
pnpm check
git commit --only src/app/registry.ts tests/app/registry.test.ts src/viz/gpt/index.ts README.md docs/roadmap.md docs/screenshots -m "Register the GPT transformer and empty the roadmap"
git checkout main && git merge --ff-only gpt-transformer
```
Pushing `main` deploys to Pages.
