# Chain Rule Graph Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-trainual:subagent-driven-development (if subagents available) or superpowers-trainual:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `calculus/chain-rule-graph`: a 6×6×6 corner whose front wall draws u = g(x), side wall y = f(u) and floor y = f(g(x)); a draggable x and a Δx slider produce a right triangle with a secant on each face so Δy/Δx = (Δy/Δu)(Δu/Δx) is visible, and tangents show the limit.

**Architecture:** As the three existing scenes: pure tested math (`core/math/compositions.ts`) and a pure reducer (`viz/chain-rule/state.ts`) drive Three.js objects that only read state. The derivative scene's `layer.ts` moves to `viz/shared/` and learns to draw a 2D face polyline on any of the three axis-aligned faces (with a lift off the face and depth testing on, because the faces are not coplanar). The shared drag gains a per-index plane normal so one attachment drives both draggable points (front wall plane and floor plane), each setting x.

**Tech Stack:** Vite 8 (Rolldown), strict TypeScript, three 0.185 (`three` core in scene code; `three/webgpu` only in `core/renderer.ts`), KaTeX, vitest (jsdom for DOM). Branch `chain-rule-graph` off `main`; fast-forward merge at the end.

**Spec:** `docs/superpowers/specs/2026-09-03-chain-rule-graph-design.md` (wins over this plan).

**Conventions for every task:** `pnpm check` green before committing; commit with `git commit --only <paths>` (never `-a`, never `git reset`/`rebase` on the shared branch); check `git show --stat HEAD`; trailer `Claude-Session: https://claude.ai/code/session_01EhwnkTHnr5TEeDqxGBKa2F`; no hard-coded colours; copy theme `Color`s; every listener/GPU resource disposed; scene objects detach (`removeFromParent` + `clear`) before the assembler's `disposeObject(scene)`; files under ~160 lines; vitest JSON output is shared, so read results from the terminal or pass `--outputFile`. Copy patterns from `src/viz/derivative/` (the closest sibling) rather than inventing new ones.

**Files:**

```
src/core/math/compositions.ts                  + tests/core/math/compositions.test.ts
src/core/math/sampling1d.ts   + sampleOn       + tests/core/math/sampling1d.test.ts
src/viz/shared/layer.ts       moved from viz/derivative/layer.ts, + Face and depth option
                                               + tests/viz/shared/layer.test.ts
src/viz/shared/drag.ts        plane.normal may be a function of the index   (tests/viz/shared/drag.test.ts)
src/viz/chain-rule/
  state.ts  frame-corner.ts  faces.ts  curves.ts  links.ts  points.ts  panel.ts  explanation.ts  index.ts
tests/viz/chain-rule/                          state, explanation, panel, index, frame-corner
src/app/registry.ts, tests/app/registry.test.ts
README.md, docs/screenshots/chain-rule-light.png, -dark.png
```

---

## Chunk 1: Math, shared layer, state

### Task 1: Branch and `compositions`

**Files:** create `src/core/math/compositions.ts`; modify `src/core/math/sampling1d.ts`; tests `tests/core/math/compositions.test.ts`, `tests/core/math/sampling1d.test.ts`.

- [ ] **Step 1:** `git checkout -b chain-rule-graph main`.
- [ ] **Step 2: Failing tests** (spec §4). `compositions.test.ts`: `COMP_KEYS` order sin3x, sinsq, gauss, sqrtq, sincube; the table's `su`, `sy`, `start`; `title`/`tex`/`texG`/`texF`/`texPrime` strings; `evaluate(c, x).dydx` vs a central difference of `x ↦ c.f(c.g(x))` (h 1e-5, rel 1e-4, abs floor 1e-6) at a fixed literal array of 25 x in [−3, 3] for every preset; `effectiveDx(2.5, 1)` = 0.5, `effectiveDx(3, 1)` = null, `effectiveDx(0, 1)` = 1; `deltas(sin3x, 0, 1e-3).duDx` = 3 (`toBeCloseTo(3, 9)`); product identity `dyDx ≈ dyDu·duDx` (1e-9 relative to |dyDx| + 1) at 25 literal (x, Δx) pairs per preset wherever `dyDu !== null`; `deltas(sinsq, −0.5, 1).dyDu` is null and `.dyDx` is 0 (Δu = 0 at x = −Δx/2 on x²); `sideSlope(sincube, 0)` = 0; `sideSlope(sqrtq, −1)` = null; `sideSlope(sin3x, 0)` = sy·1/su = 7.5; bounds on a 601-point grid: max |su·g| ≤ 3 + 1e-9 and max |sy·f(g)| ≤ 3 + 1e-9 for every preset.
  `sampling1d.test.ts` (append): `sampleOn(Math.sqrt, [−1, 1], 5)` → T evenly spaced, V has NaN for negative T and 0, 1/√2 … for the rest (NaN passes through).
- [ ] **Step 3:** Run, confirm fail.
- [ ] **Step 4: Implement** `compositions.ts` (`CompKey`, `Composition`, `COMPOSITIONS`, `COMP_KEYS`, `DOMAIN`, `DX_RANGE`, `FACE = 6`, `evaluate`, `effectiveDx`, `deltas`, `sideSlope`). `f`/`df` return NaN outside their domain (`sqrtq`: u < 0 → NaN; `df` at u = 0 is Infinity, leave it, `sideSlope` = sy·df(u)/su, null when df(u) is not finite). KaTeX: sin3x `\sin 3x`, `3x`, `\sin u`, `\cos(3x)\cdot 3`; sinsq `\sin x^2`, `x^2`, `\sin u`, `\cos(x^2)\cdot 2x`; gauss `e^{-x^2/2}`, `-x^2/2`, `e^{u}`, `e^{-x^2/2}\cdot(-x)`; sqrtq `\sqrt{x^2+1}`, `x^2+1`, `\sqrt{u}`, `\frac{1}{2\sqrt{x^2+1}}\cdot 2x`; sincube `\sin^3 x`, `\sin x`, `u^3`, `3\sin^2 x\cdot\cos x`. Titles are the plain-text forms ("sin 3x", "sin x²", "e^(−x²/2)", "√(x²+1)", "sin³x"). One-sentence hints from the spec's "Why" column, plus for gauss and sqrtq a clause that the side curve leaves the wall and is clipped. `sampleOn(fn, [a, b], n = 241)` in `sampling1d.ts`.
- [ ] **Step 5:** Run, confirm pass; `pnpm check`; commit "Add composed functions with chain-rule helpers and generic sampling".

### Task 2: Shared face layer

**Files:** move `src/viz/derivative/layer.ts` → `src/viz/shared/layer.ts` (`git mv`); modify `src/viz/derivative/{axes,curves,lines}.ts` imports (they import `./layer`); `CLIP` stays derivative-specific: leave it in a small `src/viz/derivative/clip.ts` (or in `axes.ts`) rather than moving it to shared; test `tests/viz/shared/layer.test.ts` (new).

- [ ] **Step 1: Failing test.** Centred face-local (a, b) land in the world per spec §3.1: `lineLayer(4, 2, { face: FACES.side })` writing `A=[0,1], B=[0,1]` gives positions `(−2.99, 3, 3), (−2.99, 4, 4)`; `FACES.front` gives `(a, 0.01, 3 + b)`; `FACES.floor` gives `(a, 3 + b, 0.01)`; the default (no options) keeps the derivative behaviour `(a, 0, b)` with no lift and `depthTest: false`; `{ depth: true }` makes a world-coordinate layer written with a new `writeWorldSegments(layer, segments)` taking `[[x,y,z],[x,y,z]]` pairs; assert it copies them verbatim and sets `depthTest: true`. A face layer has `depthTest: true`, `depthWrite: false`, `transparent: true`, the given `renderOrder`. `writeClippedPolyline` on a face layer with `bound = [3, 3]`: a segment from (0, 0) to (0, 7) is cut at b = 3 (world Z = 6 on the front wall); a segment with a NaN endpoint is skipped and the neighbours still draw.
- [ ] **Step 2:** Run, confirm fail (module not found).
- [ ] **Step 3: Implement.** `git mv`, fix imports. Add
  ```ts
  export interface Face { axes: readonly [0|1|2, 0|1|2]; fixedAxis: 0|1|2; offset: number; lift: number; centre: readonly [number, number] }
  export const FACES = { front: {axes:[0,2], fixedAxis:1, offset:0, lift:0.01, centre:[0,3]}, side: {axes:[1,2], fixedAxis:0, offset:-3, lift:0.01, centre:[3,3]}, floor: {axes:[0,1], fixedAxis:2, offset:0, lift:0.01, centre:[0,3]} } satisfies Record<"front" | "side" | "floor", Face>;
  ```
  `lineLayer(endpoints, renderOrder, opts?: { face?: Face; depth?: boolean })`: without options, exactly today's behaviour. With a face, `depthTest: true` and the layer remembers it; `writeClippedPolyline` and `writePoints` place face-local (a, b) via `face.axes`/`face.centre` and set the fixed axis to `offset + lift`. `writePolyline` takes a raw buffer (derivative `curves.ts` writes into a cache) and is left untouched. `writeClippedPolyline` keeps clipping about (0, 0) in face-local coordinates (callers pass centred values); it skips any segment with a non-finite endpoint. `writeWorldSegments(layer, segments: readonly (readonly [Vec3, Vec3])[])` for `{ depth: true }` layers. Keep each file under ~160 lines; split the writers into `layer-write.ts` if needed.
- [ ] **Step 4:** Run all tests (derivative suite must stay green), `pnpm check`; commit "Move the line layer helper to viz/shared and let it draw on any axis-aligned face".

### Task 2b: Per-index drag plane normal

**Files:** modify `src/viz/shared/drag.ts`; test `tests/viz/shared/drag.test.ts`.

- [ ] **Step 1: Failing test.** With `plane: { normal: (i) => i === 1 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0), getOffset: () => 0 }` and two hit spheres, with `normal` a `vi.fn` wrapper, dragging target 1 calls it with 1 and target 0 with 0; with an off-axis Z-up camera the two planes give distinguishable reported x values (assert against the hand-computed ray/plane hits). Do not assert anything about index −1: click-to-place raycasts `surfaceTarget` and never consults the plane. Existing `Vector3` form still works.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement.** `normal: Vector3 | ((index: number) => Vector3)`; `setDragPlane(index)` resolves the function form, copies and normalises. Nothing else changes.
- [ ] **Step 4:** Run, `pnpm check`; commit "Let a drag plane's normal depend on the grabbed target".

### Task 3: State

**Files:** create `src/viz/chain-rule/state.ts`; test `tests/viz/chain-rule/state.test.ts`.

- [ ] **Step 1: Failing tests** (spec §5): `initialState()` (sin3x, x 0.4, dx 0.5, triangles/secants/connectors true, tangents false); `setComp` → new start, dx kept; `setX` clamps to [−3, 3]; `setDx` clamps to [1e-3, 2]; `setShow` changes only that flag; `reset` → start, dx 0.5, show kept; `derived` at the default state: `u = 1.2`, `y = sin 1.2`, `dg = 3`, `df = cos 1.2`, `dydx = 3cos 1.2`, `dxEff = 0.5`, `deltas` matches `deltas(COMPOSITIONS.sin3x, 0.4, 0.5)`, `sideSlope` matches the helper; at x = 3 `dxEff` and `deltas` are null.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement** `state.ts`: `ChainState`, `ShowKey`, `initialState`, `setComp`, `setX`, `setDx`, `setShow`, `reset`, `derived` (returns `{ comp, u, y, dg, df, dydx, dxEff, deltas, sideSlope, showPrimed }` where `showPrimed = dxEff !== null && (show.triangles || show.secants)`). Export `DX_DEFAULT = 0.5`.
- [ ] **Step 4:** Run, confirm pass; `pnpm check`; commit "Add chain rule scene state".

## Chunk 2: Scene objects

### Task 4: Framing and faces

**Files:** create `src/viz/chain-rule/frame-corner.ts`, `src/viz/chain-rule/faces.ts`; test `tests/viz/chain-rule/frame-corner.test.ts`.

- [ ] **Step 1: Failing test:** `frameCorner()` → target `[0, 3, 3]`; position = TARGET + 6.5·OFFSET per spec §3.3, i.e. `toBeCloseTo` (8.775, −7.4, 8.85); position.x > 0, position.y < 0, position.z > target z (the +x, −y, +z octant).
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement** `frame-corner.ts` (constants `TARGET`, `OFFSET = [1.35, −1.6, 0.9]`, `SCALE = 6.5`). `faces.ts` `createFaces(theme)`: three `PlaneGeometry(6, 6)` meshes (front: `rotation.x = π/2`, position (0, 0, 3); side: `rotation.y = π/2` then check the plane's normal is ±x, position (−3, 3, 3); floor: no rotation, position (0, 3, 0)); `MeshBasicMaterial({ color: theme.faint (copied), transparent: true, opacity: 0.35, side: DoubleSide, depthWrite: false })`, `renderOrder 0`; one plain (no-face) `LineSegments` layer of the nine corner edges (`--line`) and the five axes + unit ticks from spec §3.1 with `depthTest: true` (write world coordinates directly: these are not face-local). Returns `{ group, front: Mesh, dispose() }` (`front` is the front face mesh, used as the drag surface target). `dispose()` releases geometries and materials, `removeFromParent`, `clear`, and unsubscribes the theme listener. Theme colours: subscribe to `theme` "change" and re-copy in an `applyTheme`, exactly as `derivative/axes.ts` does (`Color.copy` snapshots values).
- [ ] **Step 4:** Run, `pnpm check`; commit "Add the chain rule corner: framing, faces, outline and axes".

### Task 5: Curves

**Files:** create `src/viz/chain-rule/curves.ts`.

- [ ] **Step 1: Implement** `createCurves(theme)`: three face layers (`FACES.front`, `.side`, `.floor`), `renderOrder 2`, `--ink`, 241 samples each, buffers sized for 240 segments. `setComposition(c)`: front `sampleOn(c.g, DOMAIN)`; side `sampleOn(c.f, [−3/su, 3/su])` (first face coordinate is depth, second is height); floor `sampleOn(x => c.f(c.g(x)), DOMAIN)`. Each written with `writeClippedPolyline(layer, A, B, [3, 3])`. Face-local coordinates are centred: front (x, su·V), side (sy·V, su·T), floor (x, sy·V); NaN samples are skipped by the layer (Task 2).
- [ ] **Step 2:** `pnpm check`; commit "Draw the three chain rule curves on their faces".

### Task 6: Links (connectors, triangles, secants, tangents)

**Files:** create `src/viz/chain-rule/links.ts` (and `links-geometry.ts` if needed to stay under ~160 lines each); test `tests/viz/chain-rule/links.test.ts`.

- [ ] **Step 1: Failing test** for the pure geometry (`links-geometry.ts`): export `facePoints(c, x, d)` → `{ p, q, r, primed: { p, q, r } | null }` as world `[x, y, z]` tuples (lifted 0.01 off their faces; `primed` null when `d.deltas` is null), and `linkSegments(c, x, d)` returning the world-space segment list grouped as `{ connectors, primed, legs, secants, tangents }` (each `readonly [Vector3-like tuple, tuple][]`). For sin3x at x = 0.4, dx 0.5: connectors has 6 segments and P = (0.4, 0.01, 3 + 1.2/3) appears as the first endpoint of two of them; the floor rectangle closes (the segment ending at R = (0.4, 3 + 2.5·sin 1.2, 0.01) from the side-wall foot and the one from the front-wall foot share that endpoint); legs: 6 segments, the front-wall vertical leg spans Z from 3 + su·u to 3 + su·g(0.9) and the side-wall vertical leg spans the same two Z values (the shared Δu leg); the side-wall depth leg and the floor depth leg span the same two Y values (shared Δy leg); secants: 3 segments each clipped inside its face box; tangents: front-wall tangent passes through P with dZ/dX = su·3, side-wall tangent through Q with dY/dZ = `sideSlope`; when `d.deltas` is null, `primed`, `legs` and `secants` are empty; for sincube at x = π/2 (Δu = 0 to within 1e-9 at some Δx: use x = π/2 − Δx/2 with Δx 0.5) the side-wall secant is absent while its legs are present; when `sideSlope` is null (pass `{ ...d, sideSlope: null }`) the side tangent is absent.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement.** Geometry in a pure module; the Three side has five plain layers (world coordinates, `depthTest: true`, `depthWrite: false`, `transparent: true`, `renderOrder` 3/4/5/5/6, colours `--soft` .8 / `--faint` .6 / `--soft` .9 / `--soft` .9 / `--accent`), lifted by 0.01 along each face's normal by the geometry module (a segment lying on the front wall gets y = 0.01, etc.). Secants: through the two face points, extended to the face box with `clipSegment` about the face centre. Tangents: front `slope = su·dg` in (X, Z) through P; floor `slope = sy·dydx` in (X, Y) through R; side wall: Y = Y_Q + sideSlope·(Z − Z_Q) through Q, clipped to the box; `null` → no tangent. Side secant omitted when `deltas.dyDu === null`. `set(c, x, d)`, `setShow({ connectors, triangles, secants, tangents })` (primed connectors follow `connectors`), `dispose()`. All five layers are `{ depth: true }` world-coordinate layers written with `writeWorldSegments`.
- [ ] **Step 4:** Run, `pnpm check`; commit "Add chain rule connectors, delta triangles, secants and tangents".

### Task 7: Points

**Files:** create `src/viz/chain-rule/points.ts`.

- [ ] **Step 1: Implement** `createPoints(theme)`: spheres per spec §3.2 (P, Q, R, P′, Q′, R′), hit spheres `hitP`, `hitR` (r 0.2, invisible material). `set(p, q, r, primed | null)` positions them (primed null hides P′ Q′ R′; the assembler passes null unless `d.showPrimed`); expose `hitP`, `hitR`, `group`, `dispose()`. Copy `derivative/points.ts` for the sphere/material recipe.
- [ ] **Step 2:** `pnpm check`; commit "Add chain rule points and drag targets".

## Chunk 3: Panel, assembly, registry, docs

### Task 8: Explanation and panel

**Files:** create `src/viz/chain-rule/explanation.ts`, `src/viz/chain-rule/panel.ts`; tests `tests/viz/chain-rule/explanation.test.ts`, `tests/viz/chain-rule/panel.test.ts` (jsdom).

- [ ] **Step 1: Failing tests.** `chainText(state, d)` returns `{ rule: string; finite: string; hint: string }` with the spec §6 sentences: at the default state the rule text contains "g′(x) = 3" and the product; finite text contains "Δx = 0.5"; when `deltas.dyDu` is null the finite text contains "Δu is 0"; when `dxEff` is null it says "Move x left of the edge". Panel: select lists the five titles in order and calls `onComp`; slider calls `onDx`; toggles call `onShow` with the right key; `render` fills readouts x/u/y/g′/f′/dy/dx and the three ratios, "—" when `dxEff` null and "— (Δu = 0)" when `dyDu` null; the Δx note is hidden normally and says "clipped to 0.5 …" at x 2.5, dx 1; equations use `createEquation` and re-render only when the preset changes (assert `.katex` node identity across two renders with the same preset, as the derivative panel test does).
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement.** Copy `derivative/{explanation,panel}.ts` structure: `createExplanation(host)` with KaTeX blocks (`\frac{dy}{dx} = \frac{dy}{du}\cdot\frac{du}{dx}`, the preset's `tex`, `texG`, `texF`, `texPrime`, and `\frac{\Delta y}{\Delta x} = \frac{\Delta y}{\Delta u}\cdot\frac{\Delta u}{\Delta x}`) and plain spans; `createChainPanel(host, handlers)` with the widgets in spec §6 order, readouts grouped Values/Derivatives/Ratios, `render(state, d)`, `dispose()`.
- [ ] **Step 4:** Run, `pnpm check`; commit "Add the chain rule panel and explanation".

### Task 9: Assembly

**Files:** create `src/viz/chain-rule/index.ts`; test `tests/viz/chain-rule/index.test.ts`.

- [ ] **Step 1: Failing test** (copy `tests/viz/derivative/index.test.ts`): first `update` renders, second idles; theme listener removed on dispose; hint shown and dismissable (key `ai-lab.hint.chain-rule`); `id`/`topic`/`title`/`summary` equal the registry entry's strings.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement** `index.ts` mirroring `derivative/index.ts`: `buildScene` with unwind (kit, faces, curves, links, points), `home = frameCorner()`, `apply(next)` computes `derived`, resamples curves only when the preset changes, computes `facePoints` for `points.set(p, q, r, d.showPrimed ? primed : null)`, calls `links.set`, `panel.render`, sets `dirty`. One `attachDrag` call: `hitTargets: [points.hitP, points.hitR]`, `plane: { normal: (i) => i === 1 ? FLOOR_NORMAL : WALL_NORMAL, getOffset: () => 0 }`, `surfaceTarget: faces.front` (the front face mesh returned by `createFaces`), `clamp` x to ±3, `onDrag` → `hint.hide(); apply(setX(state, p[0]))`. HINT lines from spec §7. Dispose order: theme listener → drag → hint → points, links, curves, faces → `disposeObject(kit.scene)` → `kit.dispose()` → panel. Export `chainRuleGraph: Visualization` with the registry's strings.
- [ ] **Step 4:** Run, `pnpm check`; commit "Assemble the chain rule graph scene".

### Task 10: Registry, README, screenshots, merge

**Files:** modify `src/app/registry.ts`, `tests/app/registry.test.ts` (if it enumerates ready ids), `README.md`; add `docs/screenshots/chain-rule-{light,dark}.png`.

- [ ] **Step 1:** Registry entry `chain-rule-graph` → `status: "ready"`, `load: () => import("../viz/chain-rule").then((m) => m.chainRuleGraph)`, summary replaced with the spec §8 text (and the same string in `index.ts`). In `tests/app/registry.test.ts`, remove `chain-rule-graph` from `roadmapExpectations` and add `it("loads the chain rule graph from its own chunk", () => loadReady("calculus", "chain-rule-graph"))`; the "derivative explorer first among calculus entries" case stays true.
- [ ] **Step 2:** `pnpm build`; confirm a separate `chain-rule` chunk appears and the entry chunk size is unchanged compared with a fresh build of `main` (`git stash`-free: build `main` in a worktree or note the size before switching).
- [ ] **Step 3: Manual pass** with `pnpm dev` and the Chrome DevTools MCP (or a browser): home framing screenshot light and dark saved to `docs/screenshots/`; Δx at 2, 0.5, 1e-3 on sin3x (ratios converge to 3, cos 1.2, 3cos 1.2); each preset once (side curve clipped on gauss/sqrtq, starts at the axis on sqrtq); drag P and R, click-to-place; toggle tangents; theme toggle; console clean. If the camera hides the floor's far corner, tune `OFFSET` within the spec's 20% and update the frame test's expectations.
- [ ] **Step 4:** README: the roadmap has no chain-rule item, so add a fourth "What's in it" paragraph ("Four scenes so far"), the scene's one-line description following the derivative entry's format, and a screenshot line. Commit "Register the chain rule graph; README and screenshots".
- [ ] **Step 5:** Final integrated review (spec compliance + code quality over `git diff main...chain-rule-graph`), fix findings, then `git checkout main && git merge --ff-only chain-rule-graph && git push` (Pages deploys on push). Verify the live site loads the scene.
