# Matrix Transformation Visualization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-trainual:subagent-driven-development (if subagents available) or superpowers-trainual:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `linear-algebra/matrix-transformation` scene: a 2×2 matrix edited by dragging basis vectors, with the plane, unit square, determinant and eigenvectors drawn live and an animate slider from identity to M.

**Architecture:** Same shape as the gradient scene: a pure, tested math module (`core/math/matrix2.ts`) and a pure reducer (`viz/matrix-transformation/state.ts`) feed Three.js objects that only read state. Shared pieces (`drag`, `framing`, `hint`) move to `src/viz/shared/` and are generalised first so both scenes use one copy. Flat coplanar layers avoid z-fighting with `depthTest: false`, `transparent: true` and explicit `renderOrder`.

**Tech Stack:** Vite 8, strict TypeScript, three 0.185 (`three` core; `three/webgpu` only in `core/renderer.ts`), KaTeX, vitest (jsdom for DOM tests). Branch `matrix-transformation` off `main`; fast-forward merge to `main` at the end (Pages deploys on push).

**Spec:** `docs/superpowers/specs/2026-09-03-matrix-transformation-design.md`. Spec wins over this plan; raise conflicts.

**Conventions for every task:** run `pnpm check` before committing and commit only when green; commit messages end with the trailer `Claude-Session: https://claude.ai/code/session_01AGV3QQNwj9LHTYvJTZFRrG`; stage only your own files and check `git show --stat HEAD`; no hard-coded colours (`ThemeColors` in the scene, CSS tokens in the DOM; copy `Color`s, never mutate them); files under ~150 lines; every listener and GPU resource has a disposer; in dispose, detach or clear before the assembler's `disposeObject(scene)` (see the contract comment in `src/core/scene.ts`).

**Files created or modified:**

```
src/core/math/matrix2.ts                          + tests/core/math/matrix2.test.ts
src/viz/types.ts, src/core/theme.ts               warn, line2          (tests/core/theme.test.ts)
src/ui/slider.ts                                  createSlider         (tests/ui/slider.test.ts)
src/ui/select.ts                                  disabled option      (tests/ui/select.test.ts)
src/viz/shared/drag.ts, framing.ts, hint.ts       moved + generalised  (tests/viz/shared/*.test.ts)
src/viz/gradient-descent/index.ts                 updated imports/calls
src/viz/matrix-transformation/
  presets.ts  state.ts  matrix-input.ts  plane.ts  basis.ts  eigen-lines.ts  panel.ts  explanation.ts  index.ts
tests/viz/matrix-transformation/                  state, matrix-input, panel, index
src/app/registry.ts, tests/app/registry.test.ts   replace roadmap entry
docs/superpowers/specs/2026-09-03-ai-lab-design.md   §9 item 2 reworded
README.md                                         roadmap + second screenshot
docs/screenshots/matrix-transformation-light.png, -dark.png
```

---

## Chunk 1: Shared groundwork

### Task 1: Branch and `matrix2` math

**Files:**
- Create: `src/core/math/matrix2.ts`
- Test: `tests/core/math/matrix2.test.ts`

- [ ] **Step 1: Create the branch**
```bash
git checkout -b matrix-transformation main
```

- [ ] **Step 2: Write failing tests**
Shape (spec §4): `Mat2 = readonly [number, number, number, number]` for [[a, b], [c, d]]; `apply(m, p)`, `det`, `trace`, `lerpIdentity(m, t)`, `fromColumns(v1, v2)`, `columns(m)`, `eigen(m): Eigen` where `Eigen = { kind: "complex" } | { kind: "uniform"; value } | { kind: "real"; pairs: readonly { value: number; vector: Vec2 }[] }`, and `clipSegment(p, q, bound): [Vec2, Vec2] | null` (Liang–Barsky against [−bound, bound]²). Tests, exactly the cases in spec §4: identity → uniform 1; scale [[2,0],[0,.5]] → pairs [2, e₁], [.5, e₂] in that order; shear [[1,1],[0,1]] → one pair λ 1, vector e₁; rotation 45° → complex; reflection → [1, e₁], [−1, e₂]; symmetric [[2,1],[1,2]] → [3, (1,1)/√2], [1, (1,−1)/√2]; projection → [1, e₁], [0, e₂] with det 0; `apply` on the four unit-square corners under the shear; `lerpIdentity` at t 0 and 1; 50 seeded-LCG random matrices with entries in [−3, 3] and disc > 1e-3: each pair satisfies |M·v − λ·v| < 1e-7 and |v| = 1; `clipSegment`: crossing one edge, fully inside (unchanged), fully outside (null), crossing two edges (both endpoints on the boundary), and a degenerate zero-length segment inside (returned as is); `det`/`trace` on the shear (1, 2) and the scale (1, 2.5); `columns(fromColumns(u, v))` round-trips to `[u, v]` and `fromColumns([1, 2], [3, 4])` is `[1, 3, 2, 4]`.

- [ ] **Step 3: Run, confirm fail** — `pnpm test`, module not found.

- [ ] **Step 4: Implement** following spec §4 to the letter: `EPS = 1e-9`; branch order complex → uniform → repeated (λ = tr/2) → two pairs ordered by descending λ; eigenvector selection `(b, λ−a)` / `(λ−d, c)` / diagonal by `|λ−a| ≤ |λ−d|`; normalise; orient x > 0, tie (|x| < 1e-12) → y > 0. Keep it under 120 lines; no allocation beyond the returned values.

- [ ] **Step 5: Run, confirm pass; `pnpm check`; commit**
```bash
git add src/core/math/matrix2.ts tests/core/math/matrix2.test.ts
git commit -m "Add 2x2 matrix math: apply, det, trace, lerp, eigen decomposition, segment clipping"
```

### Task 2: Theme gains `warn` and `line2`

**Files:**
- Modify: `src/viz/types.ts`, `src/core/theme.ts`
- Test: `tests/core/theme.test.ts`

- [ ] **Step 1: Failing test** — extend the shared `LIGHT` map in `tests/core/theme.test.ts` with `--warn` and `--line-2` and add both fields to the "reads every token" assertion; `colors.warn.getHexString()` and `colors.line2.getHexString()` match; `refresh()` updates both in place.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** — add `warn: Color; line2: Color` to `ThemeColors` (keep the interface comment), the two token entries in `TOKENS` in tokens.css order (`line2` after `line`, `warn` after `accent`; the `satisfies` guard forces the additions) and the two fields in the implementation. Confirm both tokens are 6-digit hex in all three blocks of `styles/tokens.css` (they are: `--warn` #85670f / #e2b357, `--line-2` #cfcfcb / #2e323b).
- [ ] **Step 4: Run, confirm pass; `pnpm check`; commit** — "Expose warn and line-2 tokens to the scene theme".

### Task 3: Linear slider and disabled select options

**Files:**
- Modify: `src/ui/slider.ts`, `src/ui/select.ts`
- Test: `tests/ui/slider.test.ts`, create `tests/ui/select.test.ts`

- [ ] **Step 1: Failing tests** — `createSlider({ label, min, max, step, value, onChange, format? })` → `{ el, get value, set value }`: native range with the given min/max/step; `format` default `(v) => fmt(v, 3)` (note `fmt` strips trailing zeros, so callers wanting "t = 1.00" pass their own `format`); `input` dispatches `onChange` with the numeric value; programmatic `.value = 0.5` moves the input and output without `onChange`; output text uses `format`. `createSelect` options gain `disabled?: boolean`: a disabled option renders with the `disabled` attribute; programmatic `.value = "custom"` still selects it.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** — share the DOM-building helpers between `createLogSlider` and `createSlider` (extract a private `buildSlider` in `slider.ts`; both public functions stay). Additive `disabled` on `SelectOption`.
- [ ] **Step 4: Run, confirm pass; `pnpm check`; commit** — "Add a linear slider and disabled select options".

### Task 4: Move and generalise the shared modules

**Files:**
- Move: `src/viz/gradient-descent/{drag,framing,hint}.ts` → `src/viz/shared/`; tests `tests/viz/gradient-descent/{drag,framing,hint}.test.ts` → `tests/viz/shared/`
- Modify: `src/viz/gradient-descent/index.ts` (imports and call sites), `tests/viz/gradient-descent/index.test.ts` if it references the hint key

- [ ] **Step 1: `git mv` the six files**, fix imports, run `pnpm check` (expect PASS with no behaviour change), commit "Move drag, framing and hint helpers to viz/shared".

- [ ] **Step 2: Failing tests for the generalised APIs** (spec §8):
  - `frameFor(domain: { x: readonly [number, number]; y: readonly [number, number] }, heightRange)`: existing bowl/rosenbrock assertions rewritten to pass `surface.domain`; the existing synthetic `wide` case becomes `frameFor({ x: [-5, 5], y: [-1, 1] }, [0, 0])` with no surface spread; new case: domain [−5, 5]², heightRange [0, 0] → target (0, 0, 0), position (10, −11.5, 8.5).
  - `attachDrag({ canvas, camera, controls, hitTargets, getPlaneZ(index), clamp?, enabled?, surfaceTarget?, onDrag(index, pos) })`: existing cases updated; new: two hit targets → `onDrag` reports index 1 when the second is grabbed; `enabled: () => false` → no drag starts, and a pointer already hovering a ball (cursor "grab") gets cursor "" on its next move (the hover branch clears rather than returning early); click-to-place calls `onDrag(-1, pos)`; a click outside the domain is clamped (clamp applies to both the move path and the click path); when `surfaceTarget` is omitted a click does nothing; `getPlaneZ(index)` receives the grabbed index and `drag.ts` keeps the negation internally (`dragPlane.constant = -getPlaneZ(index)`, since the plane normal is +Z).
  - `createUsageHint(container, { storageKey, heading?, lines })`: existing tests pass the gradient key; new: a different key is stored/read.
- [ ] **Step 3: Implement the generalisations** and update the gradient caller: `hitTargets: [marker.hitTarget]`, `getPlaneZ: () => s·f(pos)` (un-negated display height), `clamp: (p) => clampToDomain(SURFACES[state.surface], p)`, `surfaceTarget: surfaceMesh.group`, `onDrag: (_i, p) => { hint?.hide(); apply(drag(state, p)); }` (keep the hint hide, it is live behaviour); hint with `storageKey: "ai-lab.hint.gradient-descent"`, its heading and the three existing lines, hoisted into a `const HINT = {…}` at the top of `index.ts` (that file is already ~225 lines; this must not grow it further). `drag.ts` must no longer import anything from `core/math/surfaces`.
- [ ] **Step 4: `pnpm check`; verify the gradient scene in Chrome** (`pnpm dev --port 5173 --strictPort` if no server is up; drag, click-to-place, hint hides on first drag) still works at http://localhost:5173/ai-lab/#/machine-learning/gradient-descent; commit "Generalise drag, framing and hint for reuse across visualizations".

---

## Chunk 2: The matrix transformation scene

### Task 5: Presets and state

**Files:**
- Create: `src/viz/matrix-transformation/presets.ts`, `src/viz/matrix-transformation/state.ts`
- Test: `tests/viz/matrix-transformation/state.test.ts`

- [ ] **Step 1: Failing tests** (spec §5): `PRESETS` table (six keys, titles, exact matrices with `Math.SQRT1_2` for the rotation), `PRESET_KEYS` order; `initialState()` defaults; `setEntry` clamps to [−3, 3], ignores non-finite, flips preset to "custom"; `setPreset` loads and sets t 1; `dragBasis(0, [4, 4])` clamps to (3, 3) and replaces column 0; `setT` clamps; `setShow`; `reset` → identity, t 1, preset identity, show preserved; `derived` for each preset at t 1: `detMt`, `traceM`, `eigen.kind`, `area`, `orientation` ("reversed" for reflection, "collapsed" for projection); `derived` at t 0.5 for reflection → `detMt` 0 → "collapsed".
  Also assert `detM` stays −1 for the reflection at t 0.5 while `detMt` is 0.
- [ ] **Step 2: Run, confirm fail; implement.**
- [ ] **Step 3: Run, confirm pass; `pnpm check`; commit** "Add matrix transformation presets and pure state".

### Task 6: Matrix input block

**Files:**
- Create: `src/viz/matrix-transformation/matrix-input.ts`
- Modify: `styles/panel.css` (`.matrix-input` grid)
- Test: `tests/viz/matrix-transformation/matrix-input.test.ts` (jsdom)

- [ ] **Step 1: Failing tests** — `createMatrixInput({ value: Mat2, onEntry(i, v) })` → `{ el, set(m: Mat2) }`: four `<input type="number" step="any" min="-3" max="3">` in a 2×2 grid with `aria-label`s "a", "b", "c", "d"; typing "1.5" into b dispatches `onEntry(1, 1.5)`; typing "-" dispatches nothing and keeps the text; blur rewrites from the last `set`; `set([1, 0.70710678, 0, 1])` shows "0.707" and does not dispatch.
- [ ] **Step 2: Run, confirm fail; implement** with a `.matrix-input` grid (CSS in `styles/panel.css`, tokens only, mono font, two columns).
- [ ] **Step 3: Run, confirm pass; `pnpm check`; commit** "Add the 2x2 matrix input block".

### Task 7: Plane layers

**Files:**
- Create: `src/viz/matrix-transformation/plane.ts`

- [ ] **Step 1: Implement** `createPlane(theme, bound = 5)` → `{ group, setMatrix(mt: Mat2, detMt: number), setShow({ grid, ghost }), dispose }` with four layers per spec §3, each material `transparent: true, depthTest: false, depthWrite: false`, `renderOrder` 1 (reference grid, `--line`), 2 (transformed grid, `--soft`), 4 (ghost square outline, `--faint`), 5 (fill, opacity .35). Transformed grid: 14 lines → 84-float buffer, `clipSegment` per line against `bound`, compacted, draw range set. Fill: a 4-vertex `BufferGeometry` quad (two triangles) whose positions are rewritten per `setMatrix`; colour `--accent` / `--warn` by sign of `detMt`; when |detMt| < 1e-6 rewrite the quad as the 0.04-wide segment spanning the collinear mapped corners (spec §3), colour `--warn`; if all corners coincide set draw range 0. Recolour on theme "change". `dispose` removes the listener, disposes geometries/materials, `group.clear()`.
- [ ] **Step 2: Node sanity check** (throwaway vitest, deleted after): identity → 14 segments drawn, fill accent; reflection → fill warn; projection → segment mode; shear at bound 5 → all 14 lines survive clipping. `pnpm check`; commit "Add plane layers: reference grid, transformed grid, ghost and unit square".

### Task 8: Basis vectors and eigen lines

**Files:**
- Create: `src/viz/matrix-transformation/basis.ts`, `src/viz/matrix-transformation/eigen-lines.ts`

- [ ] **Step 1: `basis.ts`** — `createBasis(theme)` → `{ group, hitTargets: [Mesh, Mesh], setMatrix(mt), setDraggable(on), dispose }`: two `ArrowHelper`s (accent for e₁, ink for e₂; head length 0.18 of the vector length clamped to [0.08, 0.3], head width 0.6 of that; `transparent: true`, `renderOrder` 10 on line and cone; hide when |column| < 1e-6), two tip balls (radius 0.08, `renderOrder` 10) and invisible-material hit spheres (radius 0.2) at the tips; `setDraggable(false)` sets the ball materials invisible (the drag handler's `enabled` predicate gates the raycast). Theme recolour; dispose materials only for arrows (shared geometry hazard, as in `marker.ts`), everything else fully.
- [ ] **Step 2: `eigen-lines.ts`** — `createEigenLines(theme, bound = 5)` → `{ group, set(eigen: Eigen, t: number), setVisible(on), dispose }`: up to two `Line`s through the origin (`--line-2`, `renderOrder` 3, transparent/depthTest off) built with `clipSegment` on ±10·v, and up to two spheres (`--ink`, radius 0.06, `renderOrder` 10) at λ(t)·v where λ(t) = 1 − t + tλ, hidden when |λ(t)| < 1e-6; nothing drawn for `complex`/`uniform`. Recolour on theme "change"; dispose removes the listener and clears the group.
- [ ] **Step 3: `pnpm check`; commit** "Add draggable basis vectors and eigen lines".

### Task 9: Panel and explanation

**Files:**
- Create: `src/viz/matrix-transformation/panel.ts`, `src/viz/matrix-transformation/explanation.ts`
- Test: `tests/viz/matrix-transformation/panel.test.ts` (jsdom)

- [ ] **Step 1: Failing tests** — `createMtPanel(host, handlers, info)` with `handlers = { onPreset, onEntry, onT, onReset, onResetView, onShow }`: renders readouts for `initialState()` (det 1, trace 2, eigenvalues "all directions", area 1, "preserved"); reflection preset → det −1 and "reversed"; rotation → "complex pair"; shear → one eigenvalue "1"; projection → "collapsed"; changing the preset select dispatches `onPreset("shear")`; the select contains a disabled "Custom" option and rendering a state with `preset: "custom"` selects it without dispatching; render with t 0.5 shows the note "Set Animate to 1 to drag the vectors" and hides it at t 1; the animate slider output reads "t = 0.50"; render does not re-fire handlers; rendering twice with the same matrix leaves the matrix equation's DOM node identity unchanged (KaTeX not re-rendered).
- [ ] **Step 2: Run, confirm fail; implement** panel per spec §6: sections Setup [preset select with the six presets plus `{ value: "custom", title: "Custom", disabled: true }`, matrix input, animate slider `createSlider({ label: "Animate", min: 0, max: 1, step: 0.01, format: (v) => `t = ${v.toFixed(2)}` })`], Run [Reset, Reset view], Show [Transformed grid, Eigenvectors, Ghost square], Readouts, the t < 1 note, then the explanation. `render` syncs the select to `state.preset` (including "custom"), the inputs via `matrixInput.set`, the slider and toggles, all guarded so handlers do not fire. `explanation.ts`: three paragraphs with `createEquation`; paragraph 1 includes the colour legend (î in the accent colour, ĵ in the ink colour, rendered as two small swatches using CSS tokens); the matrix equation string is built from `fmt(v, 3)` entries and passed to `set` on every render (the equation helper skips identical strings, so KaTeX re-renders only when the matrix changes); det sentence with the t < 1 clause; eigen sentence per kind incl. the projection wording.
- [ ] **Step 3: Run, confirm pass; `pnpm check`; commit** "Add matrix transformation panel and explanation".

### Task 10: Assemble, register, verify

**Files:**
- Create: `src/viz/matrix-transformation/index.ts`, `docs/screenshots/matrix-transformation-light.png`, `-dark.png`
- Modify: `src/app/registry.ts`, `tests/app/registry.test.ts`, `docs/superpowers/specs/2026-09-03-ai-lab-design.md` (§9 item 2), `README.md` (roadmap: mark matrix transformation shipped; add the screenshot under the first)
- Test: `tests/viz/matrix-transformation/index.test.ts` (jsdom; mirror the gradient index test: mount renders once, idles on the second update, dispose removes the theme listener and hint)

- [ ] **Step 1: Flip the registry test**: `findEntry("linear-algebra", "matrix-transformation")` is `ready` with `mount`; the summary no longer mentions a cube. Confirm FAIL.
- [ ] **Step 2: `index.ts`** mirroring `gradient-descent/index.ts`: `buildScene` with unwind on failure; `createSceneKit(host.renderer, host.theme, { reducedMotion: prefersReducedMotion() })`; plane, basis, eigen lines added; `attachDrag({ hitTargets: basis.hitTargets, getPlaneZ: () => 0, clamp: (p) => clamp each component to [−3, 3], enabled: () => state.t === 1, onDrag: (i, p) => { hint.hide(); apply(dragBasis(state, i as 0 | 1, p)); } })` (no `surfaceTarget`; the `clamp` is belt-and-braces so the ball never renders outside the box before the reducer, which also clamps, runs); panel handlers → `setPreset`, `setEntry`, `setT`, `reset`, `setShow`, `onResetView` → stored pose; `apply(next)`: `d = derived(state)`, `plane.setMatrix(d.mt, d.detMt)`, `basis.setMatrix(d.mt)`, `basis.setDraggable(state.t === 1)`, `eigen.set(d.eigen, state.t)`, visibilities from `show`, `panel.render(state, d)`, `dirty = true`; `update` renders on `dirty || controls moved`; framing `frameFor({ x: [−5, 5], y: [−5, 5] }, [0, 0])`; usage hint with the spec §7 lines and key `ai-lab.hint.matrix-transformation`; `dispose` in reverse order. Register as the linear-algebra entry with summary "Drag the two basis vectors and watch the plane, the unit square, the determinant and the eigenvectors respond."
- [ ] **Step 3: `tests/viz/matrix-transformation/index.test.ts`** (jsdom; mirror `tests/viz/gradient-descent/index.test.ts`): mount renders once (`update` true), second `update` with no input returns false, `dispose` removes the theme listener and the hint, mount with the hint key already stored shows no hint. Run: `pnpm check` — PASS.
- [ ] **Step 4: Chrome verification** (own isolated context; dev server on 5173): shear preset → parallelogram, one eigen line; reflection → warn fill, det −1, "reversed"; rotation → no eigen lines, "complex pair"; projection → collapsed warn segment, ĵ arrow hidden, ĵ ball at origin; drag î to (2, 0) → det 2, area 2, inputs show 2 and 0; Animate 0.5 → half-way shape, balls hidden, note visible, dragging does nothing; Animate back to 1 re-enables; orbit shows no z-fighting flicker (screenshot at a grazing angle); light `--warn` legibility check (advisory: if it reads brown, raise the fill opacity to .45 for the warn case and note it); theme toggle repaints; home and back → no leak warning; console clean. Save the two screenshots.
- [ ] **Step 5: Reword the parent spec §9 item 2 and the README roadmap; commit** "Add matrix transformation visualization and register it".

### Task 11: Merge and deploy

- [ ] **Step 1:** `pnpm check && pnpm build` on the branch; `git checkout main && git merge --ff-only matrix-transformation && git push`; then
```bash
gh run watch $(gh run list -w pages.yml -L1 --json databaseId -q '.[0].databaseId') --exit-status
```
and confirm https://knewman23.github.io/ai-lab/#/linear-algebra/matrix-transformation loads. Delete the local branch.
