# Derivative and Tangent Explorer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-trainual:subagent-driven-development (if subagents available) or superpowers-trainual:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `calculus/derivative-tangent`: a 1D function on a vertical plane with a draggable point, tangent, secant (h slider), a derivative curve underneath, snapping to non-differentiable points, and a domain-rescale zoom that shows the curve becoming its tangent.

**Architecture:** As the two existing scenes: pure tested math (`core/math/functions1d.ts`) and a pure reducer (`viz/derivative/state.ts`) drive Three.js objects that only read state. Flat coplanar layers on the plane y = 0 use `transparent/depthTest:false/renderOrder`. The shared drag gains a drag-plane option (union type) for the vertical plane. Zoom is a pure re-sampling (`zoomSamples`), not a camera move.

**Tech Stack:** Vite 8, strict TypeScript, three 0.185 (`three` core only), KaTeX, vitest (jsdom for DOM). Branch `derivative-explorer` off `main`; fast-forward merge at the end.

**Spec:** `docs/superpowers/specs/2026-09-03-derivative-explorer-design.md` (wins over this plan).

**Conventions for every task:** `pnpm check` green before committing; commit with `git commit --only <paths>` (never `-a`, never `git reset`/`rebase` on the shared branch); check `git show --stat HEAD`; trailer `Claude-Session: https://claude.ai/code/session_01AGV3QQNwj9LHTYvJTZFRrG`; no hard-coded colours; copy theme `Color`s; every listener/GPU resource disposed; scene objects detach (`removeFromParent` + `clear`) before the assembler's `disposeObject(scene)`; files under ~160 lines; vitest JSON output is shared, so read results from the terminal or pass `--outputFile`.

**Files:**

```
src/core/math/functions1d.ts                   + tests/core/math/functions1d.test.ts
src/viz/shared/drag.ts                         drag-plane union option   (tests/viz/shared/drag.test.ts)
src/viz/derivative/
  state.ts  frame-vertical.ts  curves.ts  lines.ts  points.ts  panel.ts  explanation.ts  index.ts
tests/viz/derivative/                          state, panel, index
src/app/registry.ts, tests/app/registry.test.ts
docs/superpowers/specs/2026-09-03-ai-lab-design.md   §9 item 5 reworded
README.md, docs/screenshots/derivative-light.png, -dark.png
```

---

## Chunk 1: Math, drag plane, state

### Task 1: Branch and `functions1d`

**Files:** create `src/core/math/functions1d.ts`; test `tests/core/math/functions1d.test.ts`.

- [ ] **Step 1:** `git checkout -b derivative-explorer main`.
- [ ] **Step 2: Failing tests** (spec §4): `FN_KEYS` order square, cubic, sine, exp, abs, sqrtabs; the table's `scale`, `primeScale`, `start`, `singularAt`; every `value` derivative vs central differences (rel 1e-4, abs floor 1e-6) at 25 seeded points with |x| > 0.05; `FNS.abs.d(0)` → `{ kind: "jump", left: −1, right: 1 }`; `FNS.sqrtabs.d(0)` → `{ kind: "vertical" }`; `FNS.abs.d(0.5)` → value 1, `FNS.abs.d(−0.5)` → value −1; `secantSlope(FNS.square, 1, h)` ≈ 2 + h (`toBeCloseTo(…, 9)`) for h ∈ {1, 0.1, 0.001}; `effectiveH(2.5, 1)` = 0.5, `effectiveH(3, 1)` = null, `effectiveH(0, 1)` = 1; band properties on a 601-point grid: max |s·f| ≤ 3 + 1e-9 for all six, max |s′·f′| ≤ 2.5 + 1e-9 for all but sqrtabs; `zoomSamples(FNS.square, 1.5, K, 241)` returns 241 X in [−3, 3] with X[120] = 0 and Z[120] = 0, and `maxDev(K) = max |Z − s·f′(x)·X|` satisfies `maxDev(4) > 3·maxDev(16) > 9·maxDev(64)`; `zoomSamples(fn, x, 1)` at zoom 0 covers the full domain [−3, 3] in X and Z = s·f(x′) − 0 … (define: at K = 1 the mapping is X = x′ − x? No: spec says zoom 0 shows the domain. Test instead that the scene uses `curveSamples(fn)` for zoom 0 (below) and `zoomSamples` only for K > 1.) Also `curveSamples(fn, n = 241)` → `{ X, Z }` with X over [−3, 3] and Z = s·f(X) and `primeSamples(fn, n)` → runs: an array of `{ X, Z }` split at `singularAt` (two runs for abs/sqrtabs, one otherwise), Z = z₀ + s′·f′ clamped to [−8.5, −3.5], the sample at the singularity omitted.
- [ ] **Step 3:** Run, confirm fail.
- [ ] **Step 4: Implement** `Derivative`, `Fn1D`, `FNS`, `FN_KEYS`, `secantSlope`, `effectiveH`, `curveSamples`, `primeSamples`, `zoomSamples`, and the display constants `Z0 = -6`, `BAND = [-8.5, -3.5]`, `DOMAIN = [-3, 3]` exported from this file. KaTeX strings: `x^2`, `x^3 - 3x`, `\sin x`, `e^{x}/5`, `|x|`, `\sqrt{|x|}` and primes `2x`, `3x^2 - 3`, `\cos x`, `e^{x}/5`, `\operatorname{sign}(x)`, `\frac{\operatorname{sign}(x)}{2\sqrt{|x|}}`. One-sentence hints per function.
- [ ] **Step 5:** Run, confirm pass; `pnpm check`; commit "Add 1D functions with derivatives, secant helpers and curve sampling".

### Task 2: Drag-plane option

**Files:** modify `src/viz/shared/drag.ts`; test `tests/viz/shared/drag.test.ts`.

- [ ] **Step 1: Failing test** — with `plane: { normal: new Vector3(0, 1, 0), getOffset: () => 0 }`, a camera on the −y axis looking at the origin, a hit sphere at (0.5, 0, 0.5): pressing on the ball then moving reports `onDrag(0, [x, y])` where `x` is the world x of the ray ∩ plane and `y` is 0 (the hit's world y); existing `getPlaneZ` tests unchanged.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement** — `DragOptions` becomes `DragBase & ({ getPlaneZ(index): number } | { plane: { normal: Vector3; getOffset(index): number } })`; in the pointerdown path `dragPlane.set(normal, -getOffset(index))` or the existing `+Z`/`-getPlaneZ` form. Hover, click-to-place and clamp unchanged. Keep the file coherent (a small `planeFor(index)` helper).
- [ ] **Step 4:** Run, confirm pass; `pnpm check`; commit "Add a drag-plane option to the shared drag handler".

### Task 3: State

**Files:** create `src/viz/derivative/state.ts`; test `tests/viz/derivative/state.test.ts`.

- [ ] **Step 1: Failing tests** (spec §5): `initialState()` (square, x 1.5, h 1, zoom 0, show all true); `setFn` → new start, zoom 0, h kept; `setX` clamps to [−3, 3]; snaps to `singularAt` at |Δ| = 0.019 and not at 0.021; no-op (same object) when zoom > 0; `setH` clamps to [1e-3, 2]; `zoomIn` caps at 3; `resetZoom`; `setShow` changes only that flag; `reset` → start, h 1, zoom 0, show kept; `derived`: for square at 1.5, h 1 → fx 2.25, d value 3, hEff 1, secant 4, gap 1, K 1, window [−3, 3], secantInWindow true; at x 2.5, h 1 → hEff 0.5, secant 5.5; at x 3 → hEff null, secant null, gap null; zoom 2 at x 1.5 → K 16, window [1.3125, 1.6875], secantInWindow false at h 1; abs at 0 → d jump, gap null.
- [ ] **Step 2:** Run, confirm fail. **Step 3:** Implement (pure; reuse `effectiveH`, `secantSlope`). **Step 4:** Run, confirm pass; `pnpm check`; commit "Add derivative explorer state".

---

## Chunk 2: Scene, panel, assembly

### Task 4: Frame, curves, lines, points

**Files:** create `src/viz/derivative/frame-vertical.ts`, `curves.ts`, `lines.ts`, `points.ts`.

- [ ] **Step 1: `frame-vertical.ts`** — `frameVertical()` → `{ position: [0, −D, −2.75], target: [0, 0, −2.75] }` with `D = (5.75 / Math.tan(Math.PI / 8)) * 1.15` (≈ 16). Five lines; unit-test it inside the state test file or its own tiny test (position y ≈ −15.96).
- [ ] **Step 2: `curves.ts`** — `createCurves(theme)` → `{ group, setFunction(fn), setZoom(fn, x, K) /* K 1 = full domain */, setShow({ derivative, guidesVisible }), setGuides(x, Zpoint, Zmarker | null), dispose }`. Layers per spec §3 table rows 1, 2, 3, 6: axes/ticks/separator (`--line`, `--faint` separator at −3.45; ticks hidden when zoomed), derivative runs (`--soft`, from `primeSamples`, hidden when zoomed or toggled off), main curve (`--ink`, from `curveSamples` at K 1 or `zoomSamples` otherwise; clipped with `clipSegment` to X ∈ [−3.5, 3.5], Z ∈ [−3.4, 3.4] when zoomed), guides (`--faint` .6). All `LineSegments` from preallocated buffers (241 samples → 480 endpoints per curve; derivative runs ≤ 482), draw ranges updated. Materials transparent/depthTest off/renderOrder 1, 2, 3, 6. Theme recolour; dispose detaches and disposes.
- [ ] **Step 3: `lines.ts`** — `createTangentSecant(theme)` → `{ group, set(input: { X0, Z0, tangentSlope: number | "vertical" | null, secant: { X1, Z1 } | null, zoomed: boolean }), setShow({ tangent, secant }), dispose }`. Tangent (`--accent`, order 5): a segment through (X0, Z0) with the display slope, extended to X ±3.5 and clipped to Z ±3.4 via `clipSegment`; vertical → X = X0 segment spanning Z ±3.4; null (jump) → hidden. Secant (`--soft` .8, order 4): through the two points, extended and clipped the same way; hidden when `secant` is null.
- [ ] **Step 4: `points.ts`** — `createPoints(theme)` → `{ group, hitTarget: Mesh, clickPlane: Mesh, set(main: [X, Z], secant: [X, Z] | null, marker: [X, Z] | null), dispose }`: spheres r 0.08 `--ink`, r 0.06 `--soft`, r 0.06 `--accent` (all `transparent: true`, renderOrder 10, depth on), hit sphere r 0.2 invisible material, click plane `PlaneGeometry(7, 12)` rotated `x = π/2` at (0, 0, −2.75) with `MeshBasicMaterial({ visible: false, side: DoubleSide })`. Everything at y = 0.
- [ ] **Step 5:** Throwaway node vitest sanity (delete before commit): curves for `abs` produce two derivative runs with a gap around X 0; zoomSamples-driven main curve for square at K 64 has draw range > 0 and all Z within ±3.4; tangent for a vertical case is a vertical segment. `pnpm typecheck`, eslint/prettier on the four files; commit "Add derivative scene layers: frame, curves, tangent/secant, points".

### Task 5: Panel and explanation

**Files:** create `src/viz/derivative/panel.ts`, `explanation.ts`; test `tests/viz/derivative/panel.test.ts` (jsdom); modify `styles/panel.css` only if a new class is needed.

- [ ] **Step 1: Failing tests** (spec §6): `createDxPanel(host, handlers)` with `handlers = { onFn, onH, onZoomIn, onResetZoom, onReset, onResetView, onShow }`: sections Setup [function select, h log slider 1e-3..2 with readout `h = …`], Run [Zoom in, Reset zoom, Reset, Reset view in a role="group" row], Show [Tangent, Secant, Derivative curve], Readouts [x, f(x), f′(x), Secant slope, Secant − f′, Window (row hidden when zoom 0)], note "Reset zoom to move the point" (hidden at zoom 0), explanation. Tests: initialState readouts (x "1.5", f "2.25", f′ "3", secant "4", gap "1", Window row hidden, note hidden); `abs` at 0 → f′ "undefined: left −1, right 1", secant "1", gap "—"; `sqrtabs` at 0 → f′ "∞ (vertical tangent)"; x 2.5, h 1 → h readout contains "clipped to 0.5"; x 3 → h readout contains "no secant" and secant "—"; zoom 3 → Zoom in disabled, Reset zoom enabled, Window row "[1.4531, 1.5469]" (fmt 4 sig), note visible; zoom 0 → Reset zoom disabled; changing the select dispatches `onFn("sine")`; render never fires handlers; rendering twice with the same function keeps the equation node identity.
- [ ] **Step 2:** Run, confirm fail. **Step 3: Implement** panel and explanation per spec §6 (three paragraphs; structure via `createEquation` once per function; numbers as text spans; the special sentences for `abs`/`sqrtabs` at the singularity; zoomed sentence). **Step 4:** Run, confirm pass; `pnpm check`; commit "Add derivative explorer panel and explanation".

### Task 6: Assemble, register, verify

**Files:** create `src/viz/derivative/index.ts`, `tests/viz/derivative/index.test.ts`, screenshots; modify `src/app/registry.ts`, `tests/app/registry.test.ts`, parent spec §9 item 5, `README.md`.

- [ ] **Step 1:** Flip the registry test: `findEntry("calculus", "derivative-tangent")` is ready with `mount`, first calculus entry. Confirm FAIL.
- [ ] **Step 2: `index.ts`** mirroring `matrix-transformation/index.ts`: `buildScene` with unwind; `createSceneKit(..., { reducedMotion: prefersReducedMotion() })`; camera from `frameVertical()` (position, target, `controls.update()`), stored as home pose; curves, lines, points added; `attachDrag({ canvas, camera, controls, hitTargets: [points.hitTarget], plane: { normal: new Vector3(0, 1, 0), getOffset: () => 0 }, clamp: (p) => [clamp(p[0], −3, 3), p[1]], enabled: () => state.zoom === 0, surfaceTarget: points.clickPlane, onDrag: (_i, p) => { hint.hide(); apply(setX(state, p[0])); } })`; hint with the spec §7 lines and key `ai-lab.hint.derivative`; panel with handlers → `setFn`, `setH`, `zoomIn`, `resetZoom`, `reset`, `setShow`, `onResetView` → home pose; `let panel` before `apply`. `apply(next)`: `d = derived(state)`; `fn = FNS[state.fn]`; if fn changed → `curves.setFunction(fn)`; `curves.setZoom(fn, state.x, d.K)`; display point `[X0, Z0] = d.K === 1 ? [x, s·fx] : [0, 0]`; secant display point when `d.secant !== null && d.secantInWindow` → `[(x+hEff−x)·K, s·(f(x+hEff)−fx)·K]` at K > 1 or `[x+hEff, s·f(x+hEff)]` at K 1; tangent slope `s·d.v` / "vertical" / null; marker `[x, Z0 + s′·f′]` or null (hidden when zoomed or undefined; clamp to band); `lines.set(...)`, `points.set(...)`, `curves.setGuides(...)`, show flags, `panel?.render(state, d)`, `dirty = true`. `update`/`resize`/theme/dispose as in the matrix scene (dispose: theme listener, drag, hint, points, lines, curves, `disposeObject(scene)`, kit, then panel). End with `apply(state)`.
- [ ] **Step 3:** Register (summary: "Drag a point along a curve and watch the tangent, the secant limit and the derivative curve respond; zoom in to see the curve become its tangent."); reword parent spec §9 item 5 and README roadmap; add the README screenshot line. `tests/viz/derivative/index.test.ts` (mount renders once, idles, dispose removes theme listener and hint). `pnpm check` PASS.
- [ ] **Step 4: Chrome** (own isolated context; dev server 5173): all spec §9 checks with observed readouts (sine drag; square at 1.5 with h 1 → 0.001 gap 1 → 0.001; abs snap at 0 → jump text, no tangent; sqrtabs at 0 → vertical tangent; three zooms on square → curve and tangent coincide, drag disabled, note; Reset zoom; theme toggle; home and back no leak; console clean). Save the two screenshots.
- [ ] **Step 5:** Commit "Add derivative and tangent explorer and register it".

### Task 7: Merge and deploy

- [ ] `pnpm check && pnpm build` (report the bundle size; if the chunk warning trips at 1200 kB, do not raise the limit: add a `build.rollupOptions.output.manualChunks` split for `three` and `katex` and confirm the app still loads); `git checkout main && git merge --ff-only derivative-explorer && git push`; watch `gh run list -w pages.yml -L1` to success; confirm https://knewman23.github.io/ai-lab/#/calculus/derivative-tangent loads; delete the branch.
