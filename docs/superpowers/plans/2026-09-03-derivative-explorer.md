# Derivative and Tangent Explorer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-trainual:subagent-driven-development (if subagents available) or superpowers-trainual:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `calculus/derivative-tangent`: a 1D function on a vertical plane with a draggable point, tangent, secant (h slider), a derivative curve underneath, snapping to non-differentiable points, and a domain-rescale zoom that shows the curve becoming its tangent.

**Architecture:** As the two existing scenes: pure tested math (`core/math/functions1d.ts`) and a pure reducer (`viz/derivative/state.ts`) drive Three.js objects that only read state. Flat coplanar layers on the plane y = 0 use `transparent/depthTest:false/renderOrder`. The shared drag gains a drag-plane option (union type) for the vertical plane. Zoom is a pure re-sampling (`zoomSamples`), not a camera move.

**Tech Stack:** Vite 8 (bundling with Rolldown), strict TypeScript, three 0.185 (`three` core in scene code; `three/webgpu` only in `core/renderer.ts`), KaTeX, vitest (jsdom for DOM). Branch `derivative-explorer` off `main`; fast-forward merge at the end.

**Spec:** `docs/superpowers/specs/2026-09-03-derivative-explorer-design.md` (wins over this plan).

**Conventions for every task:** `pnpm check` green before committing; commit with `git commit --only <paths>` (never `-a`, never `git reset`/`rebase` on the shared branch); check `git show --stat HEAD`; trailer `Claude-Session: https://claude.ai/code/session_01AGV3QQNwj9LHTYvJTZFRrG`; no hard-coded colours; copy theme `Color`s; every listener/GPU resource disposed; scene objects detach (`removeFromParent` + `clear`) before the assembler's `disposeObject(scene)`; files under ~160 lines; vitest JSON output is shared, so read results from the terminal or pass `--outputFile`.

**Files:**

```
src/core/math/functions1d.ts, sampling1d.ts    + tests/core/math/{functions1d,sampling1d}.test.ts
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

**Files:** create `src/core/math/functions1d.ts`, `src/core/math/sampling1d.ts`; tests `tests/core/math/functions1d.test.ts`, `tests/core/math/sampling1d.test.ts`.

- [ ] **Step 1:** `git checkout -b derivative-explorer main`.
- [ ] **Step 2: Failing tests** (spec §4). `tests/core/math/functions1d.test.ts`: `FN_KEYS` order square, cubic, sine, exp, abs, sqrtabs; the table's `scale`, `primeScale`, `start`, `singularAt`; the six `title`/`tex`/`texPrime` strings; every `value` derivative vs a local 1D central difference `(f(x+h) − f(x−h))/2h`, h 1e-5 (rel 1e-4, abs floor 1e-6) at a fixed literal array of 25 x values in [−3, 3] with |x| > 0.05; `FNS.abs.d(0)` → `{ kind: "jump", left: −1, right: 1 }`, `FNS.abs.d(1e-12)` jump, `FNS.abs.d(1e-6)` value; `FNS.sqrtabs.d(0)` → `{ kind: "vertical" }`; `FNS.abs.d(±0.5)` → value ±1; `secantSlope(FNS.square, 1, h)` ≈ 2 + h (`toBeCloseTo(…, 9)`) for h ∈ {1, 0.1, 0.001}; `effectiveH(2.5, 1)` = 0.5, `effectiveH(3, 1)` = null, `effectiveH(0, 1)` = 1; band properties on a 601-point grid: max |s·f| ≤ 3 + 1e-9 for all six, max |s′·f′| ≤ 2.5 + 1e-9 for all but sqrtabs.
  `tests/core/math/sampling1d.test.ts`: `curveSamples(fn, 241)` → `{ X, Z }` with X evenly over [−3, 3] and Z = s·f(X); `primeSamples(fn, 241)` → runs split at `singularAt` (one run for null, two for abs/sqrtabs with the singular sample omitted), Z = Z0 + s′·f′ clamped to BAND; `zoomSamples(FNS.square, 1.5, K, 241)` → X[120] = 0, Z[120] = 0, X spans [−3, 3]; at K = 1 the identity Z = s·(f(x + X) − f(x)) holds; `maxDev(K) = max |Z − s·f′(x)·X|` with two separate expects `maxDev(4) > 3·maxDev(16)` and `maxDev(16) > 3·maxDev(64)` (for x² the deviation is exactly s·X²/K, so a factor of 4 per step).

- [ ] **Step 3:** Run, confirm fail.

- [ ] **Step 4: Implement** `src/core/math/functions1d.ts` (`Derivative`, `Fn1D`, `FNS`, `FN_KEYS`, `secantSlope`, `effectiveH`, constants `DOMAIN = [-3, 3]`, `Z0 = -6`, `BAND = [-8.5, -3.5]`; under ~160 lines) and `src/core/math/sampling1d.ts` (`curveSamples`, `primeSamples` incl. the band clamp, `zoomSamples` with X = (x′ − x)·K, Z = s·(f(x′) − f(x))·K over [x − 3/K, x + 3/K]). KaTeX strings: `x^2`, `x^3 - 3x`, `\sin x`, `e^{x}/5`, `|x|`, `\sqrt{|x|}`; primes `2x`, `3x^2 - 3`, `\cos x`, `e^{x}/5`, `\operatorname{sign}(x)`, `\frac{\operatorname{sign}(x)}{2\sqrt{|x|}}`. One-sentence hints.

- [ ] **Step 5:** Run, confirm pass; `pnpm check`; commit "Add 1D functions with derivatives, secant helpers and curve sampling" (both source files and both test files).

### Task 2: Drag-plane option

**Files:** modify `src/viz/shared/drag.ts`; test `tests/viz/shared/drag.test.ts`.

- [ ] **Step 1: Failing test** — a second harness with `plane: { normal: new Vector3(0, 1, 0), getOffset: () => 0 }`, a camera at (0, −1, 0) with `camera.up.set(0, 0, 1)` then `lookAt(0, 0, 0)` (Z-up, as the real scene; without the `up` change `lookAt` is degenerate), 90° fov over a 200×200 stubbed rect so screen x 0..200 maps to world x −1..1 and screen y to world z; a hit sphere at (0.5, 0, 0.5): pressing on the ball then moving to a known screen point reports `onDrag(0, [x, 0])` with the derived world x. Existing `getPlaneZ` assertions unchanged, but the file's `Overrides = Partial<Pick<DragOptions, …>>` must be rewritten in terms of an exported `DragBase` (the union has no common `getPlaneZ` key). Add `// @ts-expect-error` cases passing both `getPlaneZ` and `plane`, and neither.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement** — export `DragBase`; `DragOptions = DragBase & ({ getPlaneZ(index): number } | { plane: { normal: Vector3; getOffset(index): number } })`; a `setDragPlane(index)` helper narrows with `"plane" in opts` and does `dragPlane.set(normal, -getOffset(index))` or the existing `+Z`/`-getPlaneZ` form. Hover, click-to-place and clamp unchanged.
- [ ] **Step 4:** Run, confirm pass; `pnpm check`; commit "Add a drag-plane option to the shared drag handler".

### Task 3: State

**Files:** create `src/viz/derivative/state.ts`; test `tests/viz/derivative/state.test.ts`.

- [ ] **Step 1: Failing tests** (spec §5): `initialState()` (square, x 1.5, h 1, zoom 0, show all true); `setFn` → new start, zoom 0, h kept; `setX` clamps to [−3, 3]; snaps to `singularAt` at |Δ| = 0.019 and not at 0.021; no-op (same object) when zoom > 0; `setH` clamps to [1e-3, 2]; `zoomIn` caps at 3; `resetZoom`; `setShow` changes only that flag; `reset` → start, h 1, zoom 0, show kept; `derived`: for square at 1.5, h 1 → fx 2.25, d value 3, hEff 1, secant 4, gap 1, K 1, window [−3, 3] (zoom 0 special-cases the window to DOMAIN, so `secantInWindow` is always true at zoom 0), secantInWindow true; at x 2.5, h 1 → hEff 0.5, secant 5.5; at x 3 → hEff null, secant null, gap null; zoom 2 at x 1.5 → K 16, window [1.3125, 1.6875], secantInWindow false at h 1; abs at 0 → d jump, secant 1 (h 1), gap null.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3:** Implement (pure; reuse `effectiveH`, `secantSlope`; `window` is DOMAIN at zoom 0 and `[x − 3/K, x + 3/K]` otherwise).
- [ ] **Step 4:** Run, confirm pass; `pnpm check`; commit "Add derivative explorer state".

---

## Chunk 2: Scene, panel, assembly

### Task 4: Frame, curves, lines, points

**Files:** create `src/viz/derivative/frame-vertical.ts`, `axes.ts`, `curves.ts`, `lines.ts`, `points.ts`; modify `src/core/math/matrix2.ts` (+ `tests/core/math/matrix2.test.ts`).

- [ ] **Step 0: rectangular clipping** — `clipSegment(p, q, bound: number | readonly [bx, by])`: a number keeps the square behaviour; a pair clips to [−bx, bx] × [−by, by]. Failing test first in `tests/core/math/matrix2.test.ts` (a segment crossing the top edge of a 3.5 × 3.4 box lands at y = 3.4; existing square tests unchanged), then implement and run.
- [ ] **Step 1: `frame-vertical.ts`** — `frameVertical()` → `{ position: [0, −D, −2.75], target: [0, 0, −2.75] }` with `D = (5.75 / Math.tan(Math.PI / 8)) * 1.15` (≈ 16). Five lines; unit-test it inside the state test file or its own tiny test (position y ≈ −15.96).
- [ ] **Step 2a: `axes.ts`** — `createAxes(theme)` → `{ group, setZoomed(on), dispose }`: four things per spec §3 row 1: the x axis at Z = 0 (X ±3.5), the Z axis at X = 0 (Z ±3.4) for the main region, the x axis at Z0 = −6 for the band (hidden when zoomed), unit ticks on the main x axis (hidden when zoomed), plus the `--faint` separator at Z = −3.45 (hidden when zoomed). `LineSegments`, `--line`/`--faint`, renderOrder 1, transparent/depthTest off. Theme recolour; dispose detaches and disposes.
- [ ] **Step 2b: `curves.ts`** — `createCurves(theme)` → `{ group, setFunction(fn), setZoom(fn, x, K), setShow({ derivative, guides }), setGuides(px, pz, markerZ | null), dispose }`. Responsibilities: `setFunction` owns the static domain curve (`curveSamples`, `--ink`, order 3) and the derivative runs (`primeSamples`, `--soft`, order 2); `setZoom` swaps in `zoomSamples` for the main curve when K > 1 (each of the 240 segments clipped with `clipSegment(…, [3.5, 3.4])`, compacted, draw range set) and restores the domain curve when K returns to 1, hiding the derivative runs while zoomed; guides (`--faint` .6, order 6) are a vertical from (px, pz) to (px, markerZ) and a short horizontal at markerZ, hidden when markerZ is null. Preallocated buffers (241 samples → 480 endpoints per curve; runs ≤ 482 total). Theme recolour; dispose detaches and disposes.
- [ ] **Step 3: `lines.ts`** — `createTangentSecant(theme)` → `{ group, set(input: { px, pz, tangentSlope: number | "vertical" | null, secant: { x: number; z: number } | null }), setShow({ tangent, secant }), dispose }`. Tangent (`--accent`, order 5): a segment through (px, pz) with the display slope, extended to X ±3.5 and clipped with `clipSegment(…, [3.5, 3.4])`; vertical → X = X0 segment spanning Z ±3.4; null (jump) → hidden. Secant (`--soft` .8, order 4): through the two points, extended and clipped the same way; hidden when `secant` is null.
- [ ] **Step 4: `points.ts`** — `createPoints(theme)` → `{ group, hitTarget: Mesh, clickPlane: Mesh, set(main: [X, Z], secant: [X, Z] | null, marker: [X, Z] | null), dispose }`: spheres r 0.08 `--ink`, r 0.06 `--soft`, r 0.06 `--accent` (`MeshStandardMaterial({ roughness: 0.5, transparent: true })`, renderOrder 10, depth on), hit sphere r 0.2 invisible material, click plane `PlaneGeometry(7, 12)` rotated `x = π/2` at (0, 0, −2.75) with `MeshBasicMaterial({ visible: false, side: DoubleSide })`. Everything at y = 0. `dispose` disposes the click plane's geometry and material too.
- [ ] **Step 5:** Throwaway node vitest sanity (delete before commit): curves for `abs` produce two derivative runs with a gap around X 0; zoomSamples-driven main curve for square at K 64 has draw range > 0 and all Z within ±3.4; tangent for a vertical case is a vertical segment. Delete the throwaway test, then `pnpm check`; commit "Add derivative scene layers: frame, axes, curves, tangent/secant, points" (five viz files + matrix2.ts + its test).

### Task 5: Panel and explanation

**Files:** create `src/viz/derivative/panel.ts`, `explanation.ts`; test `tests/viz/derivative/panel.test.ts` (jsdom); modify `styles/panel.css` only if a new class is needed.

- [ ] **Step 1: Failing tests** (spec §6): `createDxPanel(host, handlers)` with `handlers = { onFn, onH, onZoomIn, onResetZoom, onReset, onResetView, onShow }`: sections Setup [function select, h log slider 1e-3..2 with readout `h = …`], Run [Zoom in, Reset zoom, Reset, Reset view in a role="group" row], Show [Tangent, Secant, Derivative curve], Readouts [x, f(x), f′(x), Secant slope, Secant − f′], then a standalone `<p class="note window">` "Window: [a, b]" (like the matrix panel's note; hidden at zoom 0; values via default `fmt`, 4 significant digits), and the note "Reset zoom to move the point" (hidden at zoom 0), then the explanation. The h slider's `format` is plain `fmt`; the clipping/no-secant text lives in its own `<p class="hint h-note">` under the slider, rewritten on every render from `derived` (a slider readout only refreshes on input or `.value` assignment, so it cannot carry state-dependent text). Tests: initialState readouts (x "1.5", f "2.25", f′ "3", secant "4", gap "1", Window row hidden, note hidden); `abs` at 0 → f′ "undefined: left −1, right 1", secant "1", gap "—"; `sqrtabs` at 0 → f′ "∞ (vertical tangent)"; x 2.5, h 1 → h readout contains "clipped to 0.5"; x 3 → h readout contains "no secant" and secant "—"; zoom 3 → Zoom in disabled, Reset zoom enabled, Window note "Window: [1.453, 1.547]", note visible; zoom 0 → Reset zoom disabled; changing the select dispatches `onFn("sine")`; clicking Zoom in / Reset zoom / Reset / Reset view and toggling Tangent dispatch their handlers; render never fires handlers; the inner `.katex` node of the function equation is the same object across two renders with the same function and a different one after rendering a state with `fn: "sine"`.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement** panel and explanation per spec §6 (three paragraphs; structure via `createEquation` once per function; numbers as text spans; the special sentences for `abs`/`sqrtabs` at the singularity; zoomed sentence).
- [ ] **Step 4:** Run, confirm pass; `pnpm check`; commit "Add derivative explorer panel and explanation".

### Task 6: Assemble, register, verify

**Files:** create `src/viz/derivative/index.ts`, `tests/viz/derivative/index.test.ts`, screenshots; modify `src/app/registry.ts`, `tests/app/registry.test.ts`, parent spec §9 item 5, `README.md`.

- [ ] **Step 1:** Flip the registry test: `findEntry("calculus", "derivative-tangent")` is ready with `mount`, first calculus entry. Confirm FAIL.
- [ ] **Step 2: `index.ts`** mirroring `matrix-transformation/index.ts`: `buildScene` with unwind; `createSceneKit(..., { reducedMotion: prefersReducedMotion() })`; camera from `frameVertical()` (position, target, `controls.update()`), stored as home pose; curves, lines, points added; `attachDrag({ canvas, camera, controls, hitTargets: [points.hitTarget], plane: { normal: new Vector3(0, 1, 0), getOffset: () => 0 }, clamp: (p) => [clamp(p[0], −3, 3), p[1]], enabled: () => state.zoom === 0, surfaceTarget: points.clickPlane, onDrag: (_i, p) => { hint.hide(); apply(setX(state, p[0])); } })`; hint with the spec §7 lines and key `ai-lab.hint.derivative`; panel with handlers → `setFn`, `setH`, `zoomIn`, `resetZoom`, `reset`, `setShow`, `onResetView` → home pose; `let panel` before `apply`. `apply(next)`: `d = derived(state)`; `fn = FNS[state.fn]`; if fn changed → `curves.setFunction(fn)`; `curves.setZoom(fn, state.x, d.K)`; display point `[px, pz] = d.K === 1 ? [x, s·fx] : [0, 0]`; secant display point when `d.secant !== null && d.secantInWindow` → `[hEff·K, s·(f(x+hEff)−fx)·K]` at K > 1 or `[x+hEff, s·f(x+hEff)]` at K 1; tangent slope `s·d.v` / "vertical" / null; marker `[x, BAND_Z0 + s′·f′]` (BAND_Z0 is the exported band centre `Z0 = −6` from functions1d; clamp to BAND) or null when zoomed or f′ undefined; `axes.setZoomed(K > 1)`, `lines.set(...)`, `points.set(...)`, `curves.setGuides(...)`, show flags, `panel?.render(state, d)`, `dirty = true`. `update`/`resize`/theme/dispose as in the matrix scene (dispose: theme listener, drag, hint, points, lines, curves, axes, `disposeObject(scene)`, kit, then panel). End with `apply(state)`.
- [ ] **Step 3:** Register (summary: "Drag a point along a curve and watch the tangent, the secant limit and the derivative curve respond; zoom in to see the curve become its tangent."); reword parent spec §9 item 5 and README roadmap; add the README screenshot line. `tests/viz/derivative/index.test.ts` (mount renders once, idles, dispose removes theme listener and hint). `pnpm check` PASS.
- [ ] **Step 4: Chrome** (own isolated context; dev server 5173): all spec §9 checks with observed readouts (sine drag; square at 1.5 with h 1 → 0.001 gap 1 → 0.001; abs snap at 0 → jump text, no tangent; sqrtabs at 0 → vertical tangent; three zooms on square → curve and tangent coincide, drag disabled, note; Reset zoom; theme toggle; home and back no leak; console clean). Save the two screenshots.
- [ ] **Step 5:** Commit "Add derivative and tangent explorer and register it".

### Task 7: Merge and deploy

- [ ] **Step 1:** `pnpm check && pnpm build`; note the main chunk size. The chunk-size warning (limit 1200 kB) is cosmetic here because every visualization is statically imported by the registry, so no split defers bytes. If the warning trips: do NOT raise the limit; add Rolldown code-splitting groups in `vite.config.ts` (`build.rollupOptions.output.codeSplitting = { groups: [{ name: "three", test: /node_modules\/three\// }, { name: "katex", test: /node_modules\/katex\// }] }`; Vite 8 bundles with Rolldown, where `manualChunks` is deprecated and object-form is ignored; the path test keeps `three.core.js`, `three.module.js` and `three.webgpu.js` in one chunk), update the stale comment there, re-run `pnpm check && pnpm build`, load the app with `pnpm preview`, and commit the config on the branch with a note that the split is cosmetic and the real lever is a dynamic `import()` per visualization (roadmap).
- [ ] **Step 2:** `git checkout main && git merge --ff-only derivative-explorer && git push`. Expected: fast-forward, push accepted.
- [ ] **Step 3:** `gh run watch $(gh run list -w pages.yml -L1 --json databaseId -q '.[0].databaseId') --exit-status` (retry the id lookup after 10 s if empty) and the same for `ci.yml`. Expected: both SUCCESS.
- [ ] **Step 4:** `curl -sI https://knewman23.github.io/ai-lab/` → 200; open `https://knewman23.github.io/ai-lab/#/calculus/derivative-tangent` in Chrome and confirm the scene mounts. `git branch -d derivative-explorer`.
