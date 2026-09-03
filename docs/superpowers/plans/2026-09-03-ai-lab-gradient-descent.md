# AI Lab — Release 1 (shell + gradient descent) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-trainual:subagent-driven-development (if subagents available) or superpowers-trainual:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `https://knewman23.github.io/ai-lab/`: a themed home page listing topics and algorithms, plus one working visualization, gradient descent on a draggable 3D loss surface.

**Architecture:** Vite + strict TypeScript, no UI framework. A thin shell (hash router, header, home page, viz frame) owns one `WebGPURenderer` (WebGL 2 fallback) and the animation loop. Each visualization is a folder exporting one `Visualization` object; it owns its scene, camera and controls and renders itself in `update`. All math (`core/math/*`) and all viz state transitions (`viz/gradient-descent/state.ts`) are pure and unit-tested; Three.js code only reads from them.

**Tech Stack:** pnpm 10, Vite 8, TypeScript 5 (strict + `noUncheckedIndexedAccess`), three 0.185.1 + @types/three 0.185.4 (`three/webgpu`, `three/addons/controls/OrbitControls.js`), katex 0.18.5, vitest 5, eslint + typescript-eslint, prettier. GitHub Actions → GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-03-ai-lab-design.md`. Where this plan and the spec disagree, the spec wins; raise the conflict rather than silently choosing.

**Verified facts used by this plan (checked 2026-09-03):**
- `three@0.185.1` exports `WebGPURenderer` from `three/webgpu`; constructor accepts `{ antialias, forceWebGL }`; `await renderer.init()` resolves to the renderer; without WebGPU it logs a warning and uses the WebGL 2 backend automatically. `renderer.info.memory.geometries` exists.
- `@types/three@0.185.4` types `three/webgpu` and `three/addons/*`.
- Portfolio assets live at `../knewman23.github.io/`: `styles.css` (tokens at lines 23–92, `.band`/`.theme`/`.card` rules at 135–255), `theme.js`, `fonts/` (4 woff2 files), and an inline `<head>` script in `index.html`.
- Local git branch is `master`; the spec deploys from `main`. Task 21 renames it.

**Conventions for every task:**
- Run `pnpm check` (typecheck + lint + test) before every commit; commit only when it passes.
- Commit messages end with the trailer `Claude-Session: https://claude.ai/code/session_01AGV3QQNwj9LHTYvJTZFRrG`.
- No hard-coded colours anywhere in `src/`. Colours come from `core/theme.ts` (scene) or CSS tokens (DOM).
- Files stay small: one responsibility each. If a file passes ~250 lines, split it.

**Files created by this plan (map):**

```
package.json, pnpm-lock.yaml, tsconfig.json, vite.config.ts, eslint.config.js, .prettierrc, .editorconfig
index.html
public/theme.js, public/fonts/*.woff2, public/.nojekyll
styles/tokens.css  styles/fonts.css  styles/shell.css  styles/panel.css
src/main.ts
src/app/router.ts  src/app/shell.ts  src/app/viz-page.ts  src/app/home.ts  src/app/header.ts  src/app/viz-frame.ts  src/app/registry.ts
src/core/renderer.ts  src/core/scene.ts  src/core/theme.ts  src/core/loop.ts
src/core/math/surfaces.ts  optimizers.ts  numeric.ts  contours.ts  ring-buffer.ts
src/ui/panel.ts  slider.ts  select.ts  button.ts  toggle.ts  readout.ts  equation.ts
src/viz/types.ts
src/viz/gradient-descent/index.ts  state.ts  surface-mesh.ts  contour-lines.ts  marker.ts  drag.ts  path-line.ts  run-timer.ts  panel.ts  explanation.ts
tests/**/*.test.ts  (mirrors src/)
.github/workflows/ci.yml  .github/workflows/pages.yml
README.md
```

Note: `core/math/contours.ts` and `core/math/ring-buffer.ts` extend the spec's `core/math/` tree; the spec requires marching squares and a 2,000-point ring buffer but does not name their files. This is an extension, not a contradiction.

---

## Chunk 1: Scaffold, theme assets, pure math

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `.prettierrc`, `.editorconfig`, `index.html`, `src/main.ts`, `src/vite-env.d.ts`
- Modify: `.gitignore` (already has `node_modules/`, `dist/`, `.superpowers/`, `.DS_Store`; add `coverage/`)

- [ ] **Step 1: Create `package.json`**
Name `ai-lab`, `"private": true`, `"type": "module"`, `"packageManager": "pnpm@10.28.2"`. Scripts:
```json
{
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "typecheck": "tsc --noEmit",
  "lint": "eslint .",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "test": "vitest run",
  "test:watch": "vitest",
  "check": "pnpm typecheck && pnpm lint && pnpm format:check && pnpm test"
}
```
Dependencies: `three@0.185.1`, `katex@0.18.5`. Dev: `vite@8`, `typescript@^5` (pin explicitly: latest `typescript` is 7.x and `typescript-eslint@8` only supports `<6.1`), `@types/three@0.185.4`, `vitest@5`, `eslint@9`, `typescript-eslint@8`, `@eslint/js`, `globals`, `prettier@3`. Run `pnpm install`.

- [ ] **Step 2: Create `tsconfig.json`**
`target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `noFallthroughCasesInSwitch: true`, `exactOptionalPropertyTypes: true`, `isolatedModules: true`, `noEmit: true`, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `types: ["vite/client"]` (Task 8 Step 6 adds `@webgpu/types` only if `navigator.gpu` fails to type). `include: ["src", "tests", "vite.config.ts"]`.

- [ ] **Step 3: Create `vite.config.ts`**
Exact config, because `base` and the test environment are non-obvious:
```ts
import { defineConfig } from "vite";

export default defineConfig({
  base: "/ai-lab/",
  build: { target: "es2022", sourcemap: true },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```
If Vite 8's `defineConfig` does not accept `test`, import `defineConfig` from `vitest/config` instead.

- [ ] **Step 4: Create lint/format config**
`eslint.config.js`: flat config using `@eslint/js` recommended + `typescript-eslint` `recommendedTypeChecked` applied to `**/*.ts` (covers `src/`, `tests/` and `vite.config.ts`, all of which are in tsconfig `include`) with `languageOptions.parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }` (required or every typed rule errors with "requires type information"); `globals.browser`; ignore `dist/`, `public/`, `node_modules/`. `eslint.config.js` itself is linted by the JS recommended block only. `.prettierrc`: `{ "printWidth": 100, "semi": true, "singleQuote": false, "trailingComma": "all" }`. `.editorconfig`: 2-space indent, LF, final newline. Add a `.prettierignore` with `dist/`, `pnpm-lock.yaml`, `public/fonts/`.

- [ ] **Step 5: Create `index.html` and `src/main.ts`**
`index.html`: `<!doctype html>`, `lang="en"`, charset, viewport, `<title>AI Lab — Krys Newman</title>`, description meta, the portfolio's favicon `<link rel="icon" href="data:image/svg+xml,...">` copied verbatim from `../knewman23.github.io/index.html`, then a placeholder comment `<!-- theme head script: Task 2 -->`, `<div id="app"></div>`, `<script type="module" src="/src/main.ts"></script>`. `src/main.ts`: sets `#app` textContent to "AI Lab" for now. `src/vite-env.d.ts`: `/// <reference types="vite/client" />`.

- [ ] **Step 6: Verify the toolchain**
Run: `pnpm check && pnpm build`
Expected: typecheck, lint and format pass; vitest reports "No test files found" and exits 0 (add `passWithNoTests: true` to the vitest config if it exits non-zero); `dist/index.html` exists.

- [ ] **Step 7: Commit**
```bash
git add -A
git commit -m "Scaffold Vite + TypeScript project with lint, format and test scripts"
```

### Task 2: Copy the portfolio's theme system verbatim

**Files:**
- Create: `styles/tokens.css`, `styles/fonts.css`, `styles/shell.css`, `public/theme.js`, `public/fonts/space-grotesk-var.woff2`, `public/fonts/plex-mono-400.woff2`, `public/fonts/plex-mono-500.woff2`, `public/fonts/plex-mono-600.woff2`, `public/.nojekyll`
- Modify: `index.html`, `src/main.ts`

- [ ] **Step 1: Copy fonts and toggle script**
```bash
mkdir -p public/fonts
cp ../knewman23.github.io/fonts/*.woff2 public/fonts/
cp ../knewman23.github.io/theme.js public/theme.js
touch public/.nojekyll
```

- [ ] **Step 2: Create `styles/tokens.css`**
Copy lines 16–92 of `../knewman23.github.io/styles.css` verbatim: the header comment, `:root { ... }` (all tokens including `--mono`, `--sans`, `--gut`, `--max`), `:root[data-theme="dark"] { ... }`, and the `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }` block. Do not edit values. Add one comment line at the top: `/* Copied verbatim from knewman23.github.io/styles.css. Edit there first. */`.

- [ ] **Step 3: Create `styles/fonts.css`**
Copy the four `@font-face` rules (lines 5–14 of the portfolio's `styles.css`), changing only the URL prefix from `fonts/` to `/fonts/`. All stylesheets are imported from `src/main.ts` (not linked from `index.html`) so Vite rewrites `/fonts/...` with `base` to `/ai-lab/fonts/...` at build time and bundles/hashes the CSS.

- [ ] **Step 4: Create `styles/shell.css`**
Copy verbatim from the portfolio: the `*, *::before, *::after` reset, `html`, `body`, `.wrap`, `a`, `:focus-visible`, `.skip`, `.skip:focus`, `.lbl`, the whole `/* top band */` block, and the whole `/* theme toggle */` block including its `:root[data-theme="dark"]` and `prefers-color-scheme` icon rules. Then copy the card rules `.card`, `.card:hover`, `.ctop`, `.cn`, `.pill`, `.p-live`, `.p-soon`, `.card h3`, `.card p`, `.cfoot`, `.tags`, `.go`, and the `@media (max-width: 760px)` band block (portfolio lines 337–340, which hides `.band nav a` except `.keep`) so the header collapses like the portfolio on phones. Add a `/* ---- ai-lab additions ---- */` section for: `.home` grid (`display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px`), `.topic h2` styling (Space Grotesk 28px, letter-spacing −.02em), `.card[aria-disabled="true"]` (cursor default, opacity .6, no hover transform), and `.notice` (a `.card`-like block for the no-GPU message).

- [ ] **Step 5: Wire into `index.html` and `src/main.ts`**
In `index.html`, replace the placeholder comment with the portfolio's inline `<script>` that reads `localStorage.getItem("theme")` and sets `document.documentElement.dataset.theme`, copied verbatim. Add `<link rel="preload" href="/fonts/space-grotesk-var.woff2" as="font" type="font/woff2" crossorigin>` and the same for `plex-mono-400.woff2` (Vite rewrites `href` in `index.html` with `base`). Add `<script src="/theme.js" defer></script>` after the app script. In `src/main.ts`, add `import "../styles/fonts.css"; import "../styles/tokens.css"; import "../styles/shell.css";` and render a temporary body with the portfolio band markup (see Task 7 for the final header) so the toggle button `#theme` and `#theme-text` exist for `theme.js`. The header is finalised in Task 9 (`header.ts`).

- [ ] **Step 6: Verify visually**
Run: `pnpm dev`, open in Chrome. Expected: background is `#fbfbf9` in light, `#0b0c0e` in dark; toggle flips instantly; reload keeps the choice; fonts render as Space Grotesk (inspect computed `font-family` on `body`). Check the console has no 404s for fonts or `theme.js`. Run `pnpm build` (a Vite warning that `/theme.js` "can't be bundled without type=module" is expected: it is served from `public/` on purpose) `&& pnpm preview` and confirm the same at `http://localhost:4173/ai-lab/`.

- [ ] **Step 7: Commit**
```bash
git add -A
git commit -m "Copy portfolio theme tokens, fonts and toggle script verbatim"
```

### Task 3: Loss surfaces with analytic gradients

**Files:**
- Create: `src/core/math/surfaces.ts`, `src/core/math/numeric.ts`
- Test: `tests/core/math/surfaces.test.ts`, `tests/core/math/numeric.test.ts`

- [ ] **Step 1: Write failing tests for `numeric.ts`**
`centralDifference(f, x, y, h = 1e-5)` returns `[fx, fy]`. Test on `f = x² + 3xy` at (1, 2): expect `[8, 3]` within 1e-6. Test `isFinitePoint([x, y])` returns false for NaN and ±Infinity components.

- [ ] **Step 2: Run tests, confirm they fail**
Run: `pnpm test`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `numeric.ts`**
Export `type Vec2 = readonly [number, number]`, `centralDifference`, `isFinitePoint`, `magnitude(v: Vec2)`.

- [ ] **Step 4: Write failing tests for `surfaces.ts`**
Define the expected shape in the test: `SURFACES` is a `Record<SurfaceKey, Surface>` where
```ts
interface Surface {
  key: SurfaceKey; title: string;
  f(x: number, y: number): number;
  grad(x: number, y: number): Vec2;
  domain: { x: [number, number]; y: [number, number] };
  scale: number;          // display scale s
  start: Vec2;
  hint: string;           // "what to look for" sentence for the explanation panel
}
```
Tests: (a) for every surface, at 25 seeded-pseudo-random points inside its domain (use a tiny LCG so the test is deterministic), `grad` matches `centralDifference` with relative tolerance 1e-4 (absolute 1e-6 floor for near-zero components); (b) spot values: `bowl.f(1,2) === 5`, `saddle.grad(1,1)` is `[2, -2]`, `rosenbrock.f(1,1) === 0`, `himmelblau.f(3,2) ≈ 0`; (c) the domain, scale and start table matches the spec §5 table exactly for all five keys; (d) `isInDomain(surface, p)` is true at corners and false just outside; (e) `clampToDomain` returns corners unchanged and clamps a point outside on both axes to the nearest corner; (f) `magnitude([3, 4]) === 5`.

- [ ] **Step 5: Run tests, confirm they fail**
Run: `pnpm test`
Expected: FAIL, module not found.

- [ ] **Step 6: Implement `surfaces.ts`**
The five surfaces from spec §5 (`bowl`, `elongated`, `saddle`, `himmelblau`, `rosenbrock`) with analytic gradients, the domain/scale/start values from the table, a `title` for the select, and the `hint` sentences from spec §5 ("raise the learning rate until the path overshoots the narrow axis" for `elongated`; "the ball slides off along y until it leaves the domain: that's the optimizer escaping a saddle" for `saddle`; write one sentence each for the other three). Export `SURFACE_KEYS` (ordered as in the spec table), `isInDomain`, `clampToDomain`.

- [ ] **Step 7: Run tests, confirm they pass**
Run: `pnpm test`
Expected: PASS.

- [ ] **Step 8: Commit**
```bash
git add -A
git commit -m "Add loss surfaces with analytic gradients verified against finite differences"
```

### Task 4: Optimizers

**Files:**
- Create: `src/core/math/optimizers.ts`
- Test: `tests/core/math/optimizers.test.ts`

- [ ] **Step 1: Write failing tests**
Shape:
```ts
type OptimizerKey = "sgd" | "momentum" | "adam";
interface Optimizer<S> {
  key: OptimizerKey; title: string;
  init(): S;
  step(pos: Vec2, grad: Vec2, lr: number, state: S): { pos: Vec2; state: S };
  /** KaTeX source for the update rule with `lr` substituted, e.g. "\theta \leftarrow \theta - 0.1\,\nabla f" */
  equation(lr: number): string;
}
```
Tests: (a) each optimizer on `bowl` from (2.5, 2), lr 0.1, reaches `|∇f| < 1e-3` within 200 steps (simulation shows SGD 41, momentum 127, Adam 151; if Adam misses on a re-run, loosen its budget per spec §7 rather than changing the optimizer); (b) Adam's first three steps from (1, 1) with grads reported by `bowl` match the paper's closed form computed inline in the test (m̂ = m/(1−β₁ᵗ), v̂ = v/(1−β₂ᵗ), θ ← θ − lr·m̂/(√v̂ + ε)) to 1e-12; (c) momentum with β = 0.9 after one step equals plain SGD (velocity starts at zero); (d) a diverging run (`rosenbrock`, SGD, lr 1, 50 steps) returns a non-finite position rather than throwing; (e) `step` never mutates its inputs (freeze the state object and assert no throw in strict mode, or compare deep-equal before/after).

- [ ] **Step 2: Run tests, confirm they fail**
Run: `pnpm test`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `optimizers.ts`**
`OPTIMIZERS: { [K in OptimizerKey]: Optimizer<StateFor<K>> }` (a mapped type rather than `Optimizer<unknown>`, which only typechecks through method bivariance) with SGD (state `null`), momentum (β 0.9, state `{ v: Vec2 }`), Adam (β₁ 0.9, β₂ 0.999, ε 1e-8, state `{ m, v, t }`). Immutable: return new state objects. Export `OPTIMIZER_KEYS` in the spec order. `equation(lr)` returns KaTeX strings; format `lr` with `formatLr` (3 significant digits, no trailing zeros) exported from this file so the panel reuses it.

- [ ] **Step 4: Run tests, confirm they pass**
Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "Add SGD, momentum and Adam optimizers with convergence and bias-correction tests"
```

### Task 5: Contours (marching squares) and ring buffer

**Files:**
- Create: `src/core/math/contours.ts`, `src/core/math/ring-buffer.ts`
- Test: `tests/core/math/contours.test.ts`, `tests/core/math/ring-buffer.test.ts`

- [ ] **Step 1: Write failing tests for `ring-buffer.ts`**
`RingBuffer<T>(capacity)` with `push`, `clear`, `size`, `capacity`, `forEach((item, ageFraction) => …)` where `ageFraction` is 0 for the oldest surviving item and 1 for the newest, and `toArray()` oldest→newest. Tests: pushing capacity+3 items drops the 3 oldest; `size` never exceeds capacity; `clear` empties; ageFraction endpoints; a single item has ageFraction 1.

- [ ] **Step 2: Write failing tests for `contours.ts`**
`marchingSquares(grid: Float32Array, nx: number, ny: number, level: number): Float32Array` returns flat `[x0, y0, x1, y1, ...]` segment endpoints in **grid index space** (caller maps to world). `contourLevels(min, max, count = 12)` returns `count` levels evenly spaced strictly inside `(min, max)`. Tests: (a) a 3×3 grid of `f = x` (values 0,1,2 per column) at level 0.5 (strictly between vertex values, so the result does not depend on `>=` vs `>` classification) yields segments that all lie on x = 0.5 and together span y from 0 to 2; (b) a grid that is constant yields zero segments; (c) `contourLevels(0, 12, 12)` gives 12 values with equal spacing and none equal to 0 or 12; (d) `x² + y²` sampled on [−2, 2]² at 21×21 at level 1 (a loop that never touches the grid boundary) produces a closed loop: every endpoint appears exactly twice across all segments (tolerance 1e-6). Handle the two saddle cases (5 and 10) by splitting on the cell-centre average.

- [ ] **Step 3: Run tests, confirm they fail**
Run: `pnpm test`
Expected: FAIL.

- [ ] **Step 4: Implement both modules**
Standard 16-case marching squares with linear interpolation on edges. Keep it allocation-light: build into a growable `number[]` then copy to a `Float32Array`.

- [ ] **Step 5: Run tests, confirm they pass**
Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "Add marching squares contour extraction and a fixed-capacity ring buffer"
```

---

## Chunk 2: Shell — types, registry, router, header, home, viz frame, renderer, loop

### Task 6: Visualization types and registry

**Files:**
- Create: `src/viz/types.ts`, `src/app/registry.ts`
- Test: `tests/app/registry.test.ts`

- [ ] **Step 1: Create `src/viz/types.ts`**
Copy the interfaces from spec §4 exactly: `TopicSlug = "calculus" | "linear-algebra" | "machine-learning"`, `RoadmapEntry`, `Visualization`, `RegistryEntry`, `Renderer` (`import("three/webgpu").WebGPURenderer`), `ThemeColors` (extends `EventTarget`, the eight `Color` fields), `VizHost`, `VizInstance`. Add `TOPICS: ReadonlyArray<{ slug: TopicSlug; title: string }>` in spec order.

- [ ] **Step 2: Write failing registry tests**
`REGISTRY: RegistryEntry[]`, `entriesByTopic(): Map<TopicSlug, RegistryEntry[]>` in `TOPICS` order, `findEntry(topic, id): RegistryEntry | undefined`. Tests: every `id` is unique; every topic in `TOPICS` appears as a key of `entriesByTopic()` even when empty; the roadmap entries from spec §3 exist with `status: "soon"` (`derivative-tangent`, `chain-rule-graph`, `matrix-transformation`, `backprop-graph`, `neural-network`, `gpt-transformer`); `gradient-descent` is not yet present (this test is inverted in Task 17 Step 1 when the viz registers).

- [ ] **Step 3: Run, confirm fail; implement `registry.ts` with roadmap entries only; run, confirm pass**
Run: `pnpm test`
Expected: PASS after implementation. Summaries are one sentence each, taken from spec §3/§9.

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "Add Visualization interface and registry with roadmap entries"
```

### Task 7: Hash router

**Files:**
- Create: `src/app/router.ts`
- Test: `tests/app/router.test.ts`

- [ ] **Step 1: Write failing tests**
Pure function `parseHash(hash: string): Route` where `Route = { kind: "home" } | { kind: "viz"; topic: string; id: string }`. Tests: `""`, `"#"`, `"#/"` → home; `"#/machine-learning/gradient-descent"` → viz; trailing slash tolerated; `"#/only-one"` → home; three segments → home; percent-encoded segments decoded. `resolveRoute(route, registry)` returns `{ kind: "home" }`, `{ kind: "viz", entry: Visualization }`, or `{ kind: "redirect" }` (unknown ids and `"soon"` ids redirect, per spec §3).

- [ ] **Step 2: Run, confirm fail; implement**
`router.ts` exports `parseHash`, `resolveRoute`, and `createRouter(onChange: (route: ResolvedRoute) => void)` that listens to `hashchange`, resolves, and for `redirect` sets `location.hash = "#/"` (which triggers a second `hashchange` to home). `start()` fires once for the current hash.

- [ ] **Step 3: Run, confirm pass, commit**
Run: `pnpm test`
Expected: PASS.
```bash
git add -A
git commit -m "Add hash router with redirect for unknown and roadmap routes"
```

### Task 8: Renderer, theme colours, loop, scene helpers

**Files:**
- Create: `src/core/renderer.ts`, `src/core/theme.ts`, `src/core/loop.ts`, `src/core/scene.ts`
- Test: `tests/core/loop.test.ts`, `tests/core/theme.test.ts`

- [ ] **Step 1: Write failing tests for `loop.ts`**
Make the loop injectable: `createLoop({ raf, caf, now, isHidden, onVisibility })` with defaults from `window`/`document`, where `onVisibility(cb: () => void) => () => void` subscribes to `visibilitychange` and returns an unsubscribe. API: `setTick(fn: (dt: number) => boolean)`, `start()`, `stop()`, `poke()` (wake from idle), `isIdle()`. Tests do **not** use `vi.useFakeTimers()` (the `node` environment has no `requestAnimationFrame`): inject a `raf` stub that records callbacks, a `caf` stub, a controllable `now()`, and an `onVisibility` stub whose callback the test invokes; the test flushes recorded rAF callbacks by hand while advancing `now`. Cases: (a) the tick receives `dt` in seconds; (b) after the tick returns false for 1 s of simulated time, the loop stops requesting frames and `isIdle()` is true; (c) `poke()` resumes; (d) `dt` is clamped to 0.1 s so a tab returning from background does not produce a huge step; (e) hidden → no frames requested, visible → resumes.

- [ ] **Step 2: Write failing tests for `theme.ts`**
`createThemeColors(read: (token: string) => string): ThemeHandle` where `ThemeHandle extends ThemeColors { refresh(): void }` is declared in `core/theme.ts` (the spec's `ThemeColors` in `viz/types.ts` stays exactly as written; `VizHost.theme` is typed as `ThemeColors`), and `read` defaults to `getComputedStyle(document.documentElement).getPropertyValue`. Tests: given a stub `read` returning `#1f4ed8` for `--accent`, `colors.accent.getHexString()` is `1f4ed8`; calling `colors.refresh()` after changing the stub updates the Color **in place** (same object identity) and dispatches `"change"`; values are trimmed (CSS custom properties come back with leading whitespace).

- [ ] **Step 3: Run, confirm fail; implement `loop.ts` and `theme.ts`**
`theme.ts` also exports `watchTheme(colors)` that observes `document.documentElement` `data-theme` attribute changes with a `MutationObserver` and `matchMedia("(prefers-color-scheme: dark)")` changes, calling `refresh()`. Tokens read: `--bg --card --sunken --ink --soft --faint --line --accent`.

- [ ] **Step 4: Implement `renderer.ts`**
```ts
export async function createRenderer(container: HTMLElement): Promise<Renderer>
```
Creates `new WebGPURenderer({ antialias: true })`, `setPixelRatio(Math.min(devicePixelRatio, 2))`, appends `renderer.domElement` to `container` (canvas `display:block; width:100%; height:100%; touch-action:none`), `await renderer.init()`. Any throw propagates to the caller (the shell handles it). Export `applySize(renderer, w, h)` that calls `setPixelRatio` (re-read, capped at 2) and `setSize(w, h, false)`. Also export `backendName(renderer): "webgpu" | "webgl2"`: `renderer.backend instanceof WebGPUBackend` (import `WebGPUBackend` from `three/webgpu`; if it is not exported there, fall back to `"isWebGPUBackend" in renderer.backend`).

- [ ] **Step 5: Implement `scene.ts`**
`createSceneKit(renderer, theme, { reducedMotion })` returns `{ scene, camera, controls, dispose }`: `PerspectiveCamera(45)`, `OrbitControls` from `three/addons/controls/OrbitControls.js` with `enableDamping = !reducedMotion`, `HemisphereLight` + `DirectionalLight` (light colours are white and exempt from the no-hard-coded-colour rule: they shape shading, not palette; note this in a comment), a `GridHelper`-free floor (the contour plane will play that role), and `scene.background` bound to `theme.bg` (update on `theme` "change"). `dispose` disposes controls and removes the theme listener. Export `disposeObject(root: Object3D)` that traverses, disposes geometries and materials (arrays too), and `prefersReducedMotion(): boolean`.

- [ ] **Step 6: Run tests, typecheck**
Run: `pnpm check`
Expected: PASS. If `navigator.gpu` or `GPUDevice` is untyped, add `@webgpu/types` to devDependencies and to `tsconfig` `types`.

- [ ] **Step 7: Commit**
```bash
git add -A
git commit -m "Add renderer factory, theme colour bridge, idle-aware loop and scene helpers"
```

### Task 9: Header, home page, viz frame, shell composition, boot

**Files:**
- Create: `src/app/header.ts`, `src/app/home.ts`, `src/app/viz-frame.ts`, `src/app/viz-page.ts`, `src/app/shell.ts`
- Modify: `src/main.ts`, `styles/shell.css`
- Test: `tests/app/home.test.ts` (uses `environment: "jsdom"` via a `// @vitest-environment jsdom` pragma; add `jsdom` to devDependencies)

- [ ] **Step 1: Write failing tests for `home.ts`**
`renderHome(registry): HTMLElement`. Tests: one `<section class="topic">` per topic in `TOPICS` order with an `<h2>`; ready entries render as `<a class="card" href="#/<topic>/<id>">` with a `.pill.p-live` reading "Live"; soon entries render as `<div class="card" aria-disabled="true">` with `.pill.p-soon` reading "Soon" and no `href`; a topic with no entries still renders its heading and a `<p class="empty">` saying visualizations are coming.

- [ ] **Step 2: Run, confirm fail; implement `home.ts`**
Markup mirrors the portfolio card: `.ctop` (`.cn` numbered `01`, `02`… + `.pill`), `<h3>` title, `<p>` summary, `.cfoot` with `.tags` = topic title and `.go` = "Open →" for live cards.

- [ ] **Step 3: Implement `header.ts`**
`renderHeader(): { el: HTMLElement; setBreadcrumb(parts: string[]) }`. Markup is the portfolio `.band` block: `.lbl` with `<b>KRYS NEWMAN</b> / AI LAB`, then a `<nav>` with a link back to `https://knewman23.github.io/` labelled "Index", an `<a href="#/">Home</a>`, and the exact theme button markup (`button.theme#theme` with the two SVG icons and `span#theme-text`) copied verbatim from the portfolio so `public/theme.js` works untouched. Breadcrumb renders inside `.lbl` after the site name: `/ MACHINE LEARNING / GRADIENT DESCENT`.

- [ ] **Step 4: Implement `viz-frame.ts`**
`createVizFrame(): { el, canvasContainer, panel, showNotice(html) }`. A fresh frame is created on every viz route and discarded on leave, so there is no `clear()`; `showNotice` replaces the frame's children with a single `.notice` element. Layout in `shell.css`: `.viz` is a grid `grid-template-columns: 1fr 360px; height: calc(100vh - 45px)`; `.viz-canvas` is `position:relative; min-height:0` with the canvas absolutely filling it; `.viz-panel` scrolls (`overflow:auto; border-left: 1px solid var(--line); background: var(--card)`). At `max-width: 800px`: one column, `.viz-canvas { aspect-ratio: 4 / 3 }`, panel stacks below, frame height auto. `showNotice` replaces the whole frame's children with a `.notice` element.

- [ ] **Step 5: Implement `viz-page.ts` (viz route lifecycle)**
`createVizPage({ main, header, theme, loop, rendererReady })` where `rendererReady: Promise<{ ok: true; renderer: Renderer } | { ok: false; error: unknown }>` never rejects. Returns `{ enter(entry: Visualization, token: number), leave() }`.
- `enter`: build a fresh `createVizFrame()` into `main`, set breadcrumb to `[topicTitle, entry.title]`, show a "Loading renderer…" placeholder, `const result = await rendererReady`. If `token` is no longer current, return without mounting. If `!result.ok` → `showNotice` with the spec's plain-HTML message ("This visualization needs WebGPU or WebGL 2…") linking to `https://github.com/knewman23/ai-frontier` (deliberate simplification of "the notebook for the same topic": release 1 links the repo root). Otherwise move `renderer.domElement` into `canvasContainer`, record `baseline = renderer.info.memory.geometries`, `instance = entry.mount(host)`, `loop.setTick(dt => instance.update(dt))`, `loop.start()`, attach a `ResizeObserver` on `canvasContainer` that calls `applySize(renderer, w, h)`, `instance.resize(w, h)`, then `loop.poke()`; call it once immediately. `pointerdown`/`pointermove`/`wheel`/`input`/`change` inside the frame call `loop.poke()`.
- `leave`: tolerant of a pending or failed `enter` (no instance yet). Order: `loop.stop()`, `loop.setTick(() => false)`, disconnect the observer, `instance?.dispose()`, then `if (import.meta.env.DEV && instance)` warn when `renderer.info.memory.geometries > baseline`. Remove the frame from `main` (the canvas is detached with it and re-attached on the next `enter`).

- [ ] **Step 6: Implement `shell.ts` (composition only)**
`createShell(root: HTMLElement)`, in this order:
1. Render header (synchronously, before any `await`, so `public/theme.js` finds `#theme`) and an empty `<main>`.
2. `theme = createThemeColors()`, `watchTheme(theme)`, `loop = createLoop()`, `theme.addEventListener("change", () => loop.poke())`.
3. `rendererReady = createRenderer(detachedHolder).then(r => ({ ok: true, renderer: r }), e => ({ ok: false, error: e }))` created once, before the router starts, so a page loaded directly on a viz hash finds it.
4. `vizPage = createVizPage(...)`.
5. Start the router with a route token counter. Home route: `vizPage.leave()`, render home into `main`, clear the breadcrumb. Viz route: `vizPage.leave()` then `vizPage.enter(entry, ++token)`. The router's initial dispatch renders the first page; nothing is rendered twice.

- [ ] **Step 7: Update `src/main.ts` to the spec's boot order**
Imports styles, then `createShell(document.getElementById("app")!)`. No renderer work in `main.ts`.

- [ ] **Step 8: Verify in Chrome with a temporary smoke viz**
Temporarily register a dev-only `Visualization` in `registry.ts` (the spinning-cube example that Task 20's README will document: own scene/camera, `update` rotates and renders, returns true) so the viz route path is exercised now. Run: `pnpm dev`. Expected: home shows three topic sections; only roadmap cards, all "Soon" and unclickable; header toggle works; `#/nope/nope` and `#/machine-learning/backprop-graph` redirect to `#/`. Open the smoke viz: cube renders, resizing the window re-fits, theme toggle re-renders the background while idle, navigating home and back works, and no geometry-leak warning appears. Test the failure path by temporarily making `createRenderer` throw: the notice shows and the console has no unhandled rejection. Remove the smoke viz and the throw before committing. Console clean.

- [ ] **Step 9: Commit**
```bash
git add -A
git commit -m "Add shell: header, home page, viz frame, renderer boot and route lifecycle"
```

---

## Chunk 3: Gradient descent visualization

### Task 10: UI widgets

**Files:**
- Create: `src/ui/panel.ts`, `src/ui/slider.ts`, `src/ui/select.ts`, `src/ui/button.ts`, `src/ui/toggle.ts`, `src/ui/readout.ts`, `styles/panel.css`
- Modify: `src/main.ts` (import `panel.css`)
- Test: `tests/ui/slider.test.ts` (jsdom)

- [ ] **Step 1: Write failing tests for the log slider**
`createLogSlider({ label, min, max, value, onChange })` returns `{ el, get value(), set value(v) }`. Native `<input type="range" min=0 max=1000>` mapped to `min·(max/min)^(t/1000)`. Tests: default value 0.1 with range 1e-3…1 maps to position ≈ 667 (2/3 of 1000); dragging to 1000 yields 1; to 0 yields 1e-3; the visible readout shows `formatLr(value)`; `onChange` fires on `input`.

- [ ] **Step 2: Run, confirm fail; implement all widgets**
All are plain functions returning `{ el, ... }` with native elements and `<label>`s: `createSelect({ label, options: {value, title}[], value, onChange })`, `createButton({ label, onClick, variant?: "primary" })` with `setDisabled`, `createToggle({ label, checked, onChange })` (native checkbox styled as a switch), `createReadout(rows: string[])` returning `{ el, set(key, text) }` rendering a `<dl>` in `--mono` with `font-variant-numeric: tabular-nums`, and `createPanel()` with `section(title): HTMLElement` for grouping. `readout.ts` also exports `fmt(n: number, sig = 4): string` (significant digits, `"—"` for non-finite values so the diverged state renders cleanly); add a test for `fmt` covering 10.25, 6.4031, NaN and Infinity. `panel.css` uses only tokens; controls use `--line` borders, `--accent` focus and thumb, 2px radii, 10px uppercase mono labels (`.lbl`) matching the portfolio.

- [ ] **Step 3: Run tests, confirm pass, commit**
```bash
git add -A
git commit -m "Add framework-free panel widgets: log slider, select, button, toggle, readout"
```

### Task 11: KaTeX equation helper

**Files:**
- Create: `src/ui/equation.ts`
- Modify: `src/main.ts` (import `katex/dist/katex.min.css`)
- Test: `tests/ui/equation.test.ts` (jsdom)

- [ ] **Step 1: Write failing test**
`createEquation(): { el, set(tex: string) }` renders display-mode KaTeX with `throwOnError: false`; `set` with the same string twice does not re-render (track the last string). Test: `set("\\nabla f")` produces a `.katex` child; a second identical `set` leaves the same child node identity.

- [ ] **Step 2: Run, confirm fail; implement; run, confirm pass**
Confirm the KaTeX fonts are bundled by checking `dist/assets/` contains `KaTeX_*.woff2` after `pnpm build`.

- [ ] **Step 3: Commit**
```bash
git add -A
git commit -m "Add KaTeX equation helper with bundled fonts"
```

### Task 12: Gradient descent state machine (pure)

**Files:**
- Create: `src/viz/gradient-descent/state.ts`
- Test: `tests/viz/gradient-descent/state.test.ts`

- [ ] **Step 1: Write failing tests**
```ts
interface GdState {
  surface: SurfaceKey; optimizer: OptimizerKey; lr: number;
  pos: Vec2; optState: unknown; steps: number;
  status: "ok" | "left-domain" | "diverged";
  running: boolean;
  path: RingBuffer<Vec2>;             // display of visited points; capacity 2000
  show: { tangent: boolean; contours: boolean; path: boolean };
}
```
`initialState()` defaults: `bowl`, `sgd`, lr 0.1, `pos = surface.start`, `steps 0`, `status "ok"`, `running false`, all three `show` flags true, path containing the start point. Invariant: the current `pos` is always the newest point in the path, so `reset`/`setSurface`/`setOptimizer` clear the path then push the new `pos`, and the polyline always starts at the ball. Reducer-style pure functions, each returning a new `GdState` (path buffer is mutated in place by design, documented): `initialState()`, `step(s)`, `drag(s, p)`, `reset(s)`, `setSurface(s, key)`, `setOptimizer(s, key)`, `setLr(s, lr)`, `toggleRun(s)`, `setShow(s, key, on)`, plus `derived(s): { loss, grad, gradMag, canStep }`. Tests encode spec §5 "Interaction details" and §5 "Controls":
- `step` on `bowl` from start reduces loss and increments `steps`; the path grows by one.
- `step` that lands outside the domain → `status: "left-domain"`, `running: false`, `canStep: false`, and `pos` stays at the last in-domain point? **No:** spec says the readout says "left the domain" for a finite point outside it, so `pos` is the out-of-domain point; `canStep` false.
- `rosenbrock`, SGD, lr 1: within 50 steps status is `"diverged"` and `pos` components are non-finite; no throw.
- `drag` clamps to domain, resets `steps` to 0, resets `optState` to `init()`, clears the path (then pushes the new point), sets status `"ok"`, and pauses running.
- `reset` returns to `surface.start`, zeroes steps, resets optState, clears path.
- `setSurface` behaves like `reset` on the new surface; `setOptimizer` keeps `pos`, resets optState and steps, clears the path; `setLr` mid-run changes only `lr`.
- `toggleRun` on a `"diverged"` state stays not running.
- The `steps` count keeps increasing past 2000 while the path size is capped at 2000.

- [ ] **Step 2: Run, confirm fail; implement `state.ts`; run, confirm pass**
Run: `pnpm test`
Expected: PASS.

- [ ] **Step 3: Commit**
```bash
git add -A
git commit -m "Add pure gradient descent state machine covering domain exit, divergence and resets"
```

### Task 13: Surface mesh and contour lines

**Files:**
- Create: `src/viz/gradient-descent/surface-mesh.ts`, `src/viz/gradient-descent/contour-lines.ts`

- [ ] **Step 1: Implement `surface-mesh.ts`**
`createSurfaceMesh(theme): { group, setSurface(surface): SurfaceGrid, dispose }` where `SurfaceGrid = { heights: Float32Array; nx: number; ny: number; heightRange: [number, number] }` (display-space heights) so the contours and camera framing reuse the samples. Geometry: `PlaneGeometry(w, h, 128, 128)` rotated so x→x, y→y (scene "up" is z; set `camera.up = (0,0,1)` in the viz, not here) with positions written directly: for each vertex `(x, y, s·f(x,y))`. A `Float32Array` colour attribute: two-stop lerp from `theme.sunken` to `theme.accent` by normalised display height. Material `MeshStandardMaterial({ vertexColors: true, roughness: .85, metalness: 0, side: DoubleSide })`. Wireframe overlay: a second `Mesh` sharing the geometry with `MeshBasicMaterial({ wireframe: true, color: theme.line, transparent: true, opacity: .25 })`. `setSurface` rewrites position/colour attributes in place (`needsUpdate`) and recomputes normals; geometry is allocated once. Subscribe to `theme` "change": recolour vertices and update the wireframe colour.

- [ ] **Step 2: Implement `contour-lines.ts`**
`createContourLines(theme): { object: LineSegments, setSurface(surface, grid: SurfaceGrid), setVisible(on), dispose }`. Uses `contourLevels` (12) over `grid.heightRange` and `marchingSquares` per level; maps grid indices to world x/y; all levels drawn at a fixed z = `heightRange.min − 0.35` (display units). One `BufferGeometry` with a preallocated position buffer (cap 200k floats, `setDrawRange`). Material `LineBasicMaterial({ color: theme.soft, transparent: true, opacity: .6 })`; recolour on theme change.

- [ ] **Step 3: Typecheck and lint**
Run: `pnpm check`
Expected: PASS (no tests for these files; they are verified visually in Task 17).

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "Add themed loss surface mesh with wireframe overlay and projected contours"
```

### Task 14: Marker, gradient arrows, tangent plane, dragging

**Files:**
- Create: `src/viz/gradient-descent/marker.ts`, `src/viz/gradient-descent/drag.ts`

- [ ] **Step 1: Implement the visual objects (`marker.ts`)**
`createMarker(theme): { group, setPosition(surface, pos: Vec2), setTangentVisible(on), dispose }`. Contents: `SphereGeometry(0.08)` ball in `theme.ink`; two `ArrowHelper`s (gradient in `theme.accent` at full opacity, negative gradient in `theme.accent` at .45 opacity via material transparency), direction from the display-space rule in spec §5: xy direction = true ∇f normalised, z component = `s·(f_x·dx + f_y·dy)` for that unit xy direction so the arrow lies in the drawn tangent plane; length `clamp(0.15·|∇f|, 0.2, 1.5)`; a `PlaneGeometry(1.2, 1.2)` tangent square, `MeshBasicMaterial` in `theme.accent`, opacity .18, `DoubleSide`, `depthWrite: false`, oriented with `lookAt` along the display-space normal `(−s·f_x, −s·f_y, 1)`. Ball, arrows and plane are positioned at `(x, y, s·f(x,y))`. The −∇f arrow uses the same rule with (dx, dy) negated, so it also lies in the drawn tangent plane. When `|∇f| < 1e-9` hide the arrows. Subscribe to `theme` "change" and re-apply `ink`/`accent` to the ball material, both arrows (`ArrowHelper.setColor` copies the colour, so call it again; the dim arrow's line and cone materials keep `transparent`/`opacity`) and the plane material; unsubscribe in `dispose`.

- [ ] **Step 2: Implement dragging (`drag.ts`)**
`attachDrag({ canvas, camera, controls, marker, getSurface, onDrag(pos: Vec2) })` returning `dispose`. Pointer events only (`pointerdown/move/up/cancel`, `setPointerCapture`). On `pointerdown`: raycast against the ball (`Raycaster` on the sphere mesh, with a slightly larger invisible hit sphere of radius 0.2 for touch); if hit, `controls.enabled = false`, and remember the drag plane: a horizontal `Plane` at the marker's current display height. On `pointermove`: intersect the ray with that plane → `(x, y)`, clamp via `clampToDomain`, call `onDrag`. On `pointerup/cancel`: `controls.enabled = true`, release capture. The caller re-positions the marker from the state (z from analytic `s·f`), so cursor jitter never lifts the ball off the surface.

- [ ] **Step 3: Typecheck and lint, commit**
Run: `pnpm check`
```bash
git add -A
git commit -m "Add draggable marker with gradient arrows and tangent plane"
```

### Task 15: Path polyline

**Files:**
- Create: `src/viz/gradient-descent/path-line.ts`

- [ ] **Step 1: Implement**
`createPathLine(theme, capacity = 2000): { group, sync(surface, path: RingBuffer<Vec2>), setVisible(on), dispose }`. One `Line` with a preallocated `BufferGeometry` (positions + colours, `setDrawRange(0, size)`), vertex colours lerped from `theme.faint` (age 0) to `theme.accent` (age 1), `LineBasicMaterial({ vertexColors: true })`. Step spheres: one `InstancedMesh` of `SphereGeometry(0.03)` with `capacity` instances, `count` = path size, instance colour matching the line. `sync` rewrites buffers from the ring buffer (oldest→newest) with z = `s·f(x,y) + 0.01`. Recolour on theme change.

- [ ] **Step 2: Typecheck, lint, commit**
```bash
git add -A
git commit -m "Add fading optimizer path with instanced step markers"
```

### Task 16: Controls panel, readouts and explanation

**Files:**
- Create: `src/viz/gradient-descent/panel.ts`, `src/viz/gradient-descent/explanation.ts`

- [ ] **Step 1: Implement `panel.ts`**
`createGdPanel(host.panel, { onSurface, onOptimizer, onLr, onStep, onToggleRun, onReset, onResetView, onShow }): { el, render(state: GdState, derived) }`. Sections in spec §5 order: Surface select, Optimizer select, Learning rate log slider (1e-3…1, default 0.1), a button row (Step, Run/Pause, Reset, Reset view), toggles (tangent plane, contours, path), then Readouts (position, loss, gradient, |∇f|, steps, status) via `createReadout`. `render` reflects state: Run button label "Run"/"Pause", Step and Run disabled when `!derived.canStep`, status text "" / "left the domain" / "diverged", numbers formatted with 4 significant digits via a shared `fmt` helper in `src/ui/readout.ts`. Below the readouts mount `explanation.ts`.

- [ ] **Step 2: Implement `explanation.ts`**
`createExplanation(): { el, render(state, derived) }`. Three paragraphs (spec §5 "Explanation panel"): (1) what the surface and ball are; (2) the gradient, with a static `createEquation` set to `\nabla f(x,y) = \left(\frac{\partial f}{\partial x}, \frac{\partial f}{\partial y}\right)` plus a `<code>` readout of the current gradient and magnitude; (3) the update rule equation from `OPTIMIZERS[key].equation(lr)` and the surface's `hint` sentence. Equation strings are only re-set when surface, optimizer or lr changes (the helper dedupes identical strings); numeric readouts update on every `render` call, which the viz calls on state change only, never per frame.

- [ ] **Step 3: Typecheck, lint, commit**
```bash
git add -A
git commit -m "Add gradient descent controls, readouts and live explanation panel"
```

### Task 17: Assemble the visualization and register it

**Files:**
- Create: `src/viz/gradient-descent/index.ts`, `src/viz/gradient-descent/run-timer.ts`
- Modify: `src/app/registry.ts`, `tests/app/registry.test.ts`
- Test: `tests/viz/gradient-descent/run-timer.test.ts`

- [ ] **Step 1: Flip the registry test**
Change the Task 6 assertion so `findEntry("machine-learning", "gradient-descent")` is a `Visualization` with `status: "ready"` and a `mount` function. Run `pnpm test`, confirm FAIL.

- [ ] **Step 2: Implement `index.ts`**
Export `gradientDescent: Visualization` (`id: "gradient-descent"`, topic `machine-learning`, title "Gradient descent", one-sentence summary). `mount(host)`:
1. `kit = createSceneKit(host.renderer, host.theme, { reducedMotion: prefersReducedMotion() })` with `camera.up.set(0,0,1)`. Framing is a pure helper `frameFor(surface, heightRange): { position, target }`: target = (domain centre x, domain centre y, heightRange mid); camera = target + `halfExtent · (2, −2.3, 1.7)` where `halfExtent` is the larger domain half-width (so `himmelblau` and `rosenbrock` frame correctly). Store the pose for "Reset view".
2. Build surface mesh, contour lines, marker, path line; add to `kit.scene`.
3. `state = initialState()`; `apply(next)` sets `state = next`, syncs the surface if the key changed (`setSurface` on mesh, pass the returned grid to contours, re-frame camera and target via `frameFor`), positions the marker, syncs the path, toggles visibilities, calls `panel.render`, and sets `dirty = true`.
4. Run timer (`run-timer.ts`, pure and unit-tested): `createRunTimer(hz)` with `advance(dt): number` returning how many steps are due (accumulator, capped at 1 step per call so a long frame never bursts) and `reset()`. Test: at 10 Hz, ten calls of 0.05 s yield five steps total; `reset` clears the accumulator. In `update`, when `state.running`, each due step calls `apply(step(state))`. Rate is 10 Hz, or 2 Hz when `prefersReducedMotion()`.
5. `update(dt)`: advance the run timer; `const moved = kit.controls.update(dt)` (OrbitControls returns true while damping is still moving); if `dirty || moved` then `renderer.render(scene, camera)`, clear `dirty`, return true; else return false.
6. `resize(w, h)`: update camera aspect and projection matrix; `dirty = true`.
7. Theme "change" listener sets `dirty = true`.
8. `dispose()`: dispose the drag handler, surface mesh, contour lines, marker and path line (each owns theme or pointer listeners), remove this viz's theme listener, then `disposeObject(scene)`, `kit.dispose()`, empty `host.panel`.

Callback wiring (all `apply(...)` unless noted):

| Callback | State function |
|---|---|
| drag `onDrag(p)` | `drag(state, p)` |
| `onSurface(key)` | `setSurface(state, key)` |
| `onOptimizer(key)` | `setOptimizer(state, key)` |
| `onLr(v)` | `setLr(state, v)` |
| `onStep` | `step(state)` |
| `onToggleRun` | `toggleRun(state)`; also `runTimer.reset()` |
| `onReset` | `reset(state)` |
| `onShow(key, on)` | `setShow(state, key, on)` |
| `onResetView` | not state: restore stored camera position and `controls.target`, `controls.update()`, `dirty = true` |

- [ ] **Step 3: Register**
In `registry.ts`, import `gradientDescent` and insert it as the first `machine-learning` entry. Run `pnpm check`. Expected: PASS.

- [ ] **Step 4: Verify in Chrome against the spec's success criteria**
Use the `visual-verify` skill or Chrome DevTools MCP. Run `pnpm dev`, open `#/`, click the Gradient descent card (two clicks from landing). Check and screenshot (light and dark) into `docs/screenshots/`:
- surface, wireframe, contours below, marker at (2.5, 2), both arrows, tangent plane visible;
- drag the ball: it stays on the surface, path clears, steps → 0, orbit disabled during drag, orbit works elsewhere;
- Step: readouts change; against an independent calculation, `bowl` at (2.5, 2) has ∇f = (5, 4), |∇f| = 6.4031, loss 10.25; one SGD step at lr 0.1 lands at (2, 1.6);
- Run on `elongated` at lr 0.1 zig-zags; at lr 0.2 it overshoots; `saddle` from start slides off and reports "left the domain"; `rosenbrock` SGD lr 1 reports "diverged", Step/Run disabled, Reset re-enables;
- switching optimizer keeps the ball and clears the path; switching surface resets;
- theme toggle flips the scene colours with no hard-coded colour visible;
- resize below 800px stacks the panel under a 4:3 scene;
- Performance panel: steady 60 fps while orbiting; after 1 s idle no frames are rendered (Rendering → Frame rendering stats shows 0 fps);
- leaving to `#/` logs no geometry-leak warning in dev;
- `chrome://flags` → disable WebGPU (or run `--disable-features=WebGPU`): the console shows three's WebGL2 fallback warning and the scene still renders.
Fix anything that fails before committing. Record fps and backend in the commit message body.

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "Add gradient descent visualization and register it on the home page"
```

---

## Chunk 4: Ship

### Task 18: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

Action majors below are the current node24 releases (checked 2026-09-03: checkout v7, setup-node v7, pnpm/action-setup v5, upload-pages-artifact v5, deploy-pages v5, configure-pages v6). Node 20 actions stop running on hosted runners on 2026-09-23, so do not downgrade. Do not use `pnpm/action-setup@v6`: it requires `packageManager` to declare pnpm 11+, and this project pins 10.28.2; v5 reads the `packageManager` field with no `version` input.

- [ ] **Step 1: Write the workflow**
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
      - run: pnpm build
```
- [ ] **Step 2: Run the same commands locally, commit**
Run: `pnpm install --frozen-lockfile && pnpm check && pnpm build`
```bash
git add -A
git commit -m "Add CI workflow: typecheck, lint, format check, test, build"
```

### Task 19: Pages deploy workflow

**Files:**
- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: Write the workflow**
```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: actions/configure-pages@v6
        with:
          enablement: true
      - uses: actions/upload-pages-artifact@v5
        with:
          path: dist
          include-hidden-files: true   # keeps public/.nojekyll in the artifact
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```
- [ ] **Step 2: Commit**
```bash
git add -A
git commit -m "Add GitHub Pages deploy workflow"
```

### Task 20: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write it**
Sections per spec §7: what it is (two sentences), the light-mode screenshot from `docs/screenshots/`, live URL, how to run (`pnpm install`, `pnpm dev`, `pnpm check`), how to add a visualization (the `Visualization`/`VizInstance` interface and a ≤10-line example that mounts a spinning cube and returns `update/resize/dispose`, then "register it in `src/app/registry.ts`"), roadmap (spec §9 list), links to ai-frontier, backprop-to-frontier and the portfolio. Keep it under 120 lines.

- [ ] **Step 2: Commit**
```bash
git add -A
git commit -m "Add README with run instructions, extension guide and roadmap"
```

### Task 21: Create the GitHub repo, push, enable Pages (owner confirmation required)

This task is outward-facing. Confirm with the owner before running it, and confirm the repo name (spec §10 lists `ai-lab` as a placeholder with `frontier-lab` and `ml-viz` as alternatives). If the name changes, update: `base` in `vite.config.ts`, the `gh repo create` slug and `gh api` path below, the live URL in `README.md` and in this plan's Goal line, and the spec's `Repo:` line.

- [ ] **Step 1: Rename the branch to `main`**
```bash
git branch -m master main
```
- [ ] **Step 2: Create the repo (without pushing yet)**
```bash
gh repo create knewman23/ai-lab --public --source=. --remote=origin --description "Interactive 3D visualizations for calculus, linear algebra and machine learning"
```
- [ ] **Step 3: Enable Pages with the Actions source, then push**
Pages must exist before the first push, or the first Deploy run fails on "Get Pages site failed" (`configure-pages` with `enablement: true` is a safety net, not a substitute).
```bash
gh api -X POST repos/knewman23/ai-lab/pages -f build_type=workflow
git push -u origin main
```
If the POST returns 409 (already exists) run the same with `-X PUT`; if PUT returns 422 add `-f 'source[branch]=main' -f 'source[path]=/'`.
- [ ] **Step 4: Verify**
Run (non-interactive; bare `gh run watch` prompts):
```bash
gh run watch $(gh run list -w ci.yml -L1 --json databaseId -q '.[0].databaseId') --exit-status
gh run watch $(gh run list -w pages.yml -L1 --json databaseId -q '.[0].databaseId') --exit-status
```
until CI and Deploy are green, then open `https://knewman23.github.io/ai-lab/` in Chrome: home loads, the gradient descent scene mounts, fonts and KaTeX load with no 404s (Network panel), theme toggle persists across reload.
- [ ] **Step 5: Hand off**
Report the live URL. The portfolio card (spec §8) is a separate change in `../knewman23.github.io` and is not part of this plan.
