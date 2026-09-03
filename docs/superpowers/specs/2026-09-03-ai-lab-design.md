# AI Lab — interactive 3D visualizations for calculus, linear algebra and machine learning

Date: 2026-09-03
Status: draft, awaiting owner review
Repo: `knewman23/ai-lab` → deployed at `https://knewman23.github.io/ai-lab/`
Sibling projects: [ai-frontier](https://github.com/knewman23/ai-frontier) (from-scratch notebooks), [backprop-to-frontier](https://github.com/knewman23/backprop-to-frontier) (curriculum), [knewman23.github.io](https://github.com/knewman23/knewman23.github.io) (portfolio, gets a new card)

## 1. Purpose

A browser app where a student picks a topic, then an algorithm, and manipulates a live 3D
scene to build intuition: drag a point on a loss surface and watch the gradient arrow and
tangent plane follow it; step an optimizer and watch the path it traces. It is both a study
tool and a portfolio showcase of applied ML, math and real-time rendering skill.

Success criteria for the first release:

- A visitor lands on the home page, understands the topic → algorithm structure in under
  ten seconds, and reaches the gradient descent scene in two clicks.
- The gradient descent scene runs at 60 fps on a 2020-era laptop, is draggable with mouse
  and touch, and every number it shows matches an independent calculation.
- The site is visually indistinguishable in palette, type and theme behaviour from
  knewman23.github.io, in both light and dark.
- A second visualization can be added by creating one folder and registering one object,
  with no changes to the shell.

Out of scope for the first release: accounts, progress tracking, server-side anything,
guided lesson mode, mobile-specific layouts beyond "does not break".

## 2. Decisions taken during brainstorming

| Question | Decision | Alternatives considered |
|---|---|---|
| First visualization | Gradient descent on a 3D loss surface | Backprop graph; matrix transformation (both on roadmap) |
| Stack | Vite + TypeScript (strict) + Three.js, no UI framework | React + React Three Fiber (hides the Three.js); no-build ES modules (does not scale) |
| Rendering | Three.js current release, `WebGPURenderer` with automatic WebGL 2 fallback | WebGL-only renderer |
| Beside the scene | Controls plus a short "what you're seeing" panel with KaTeX equations that update live | Controls only; full guided lesson (roadmap: optional walkthrough layer) |
| Theming | Copy the portfolio's tokens, fonts and theme-toggle script verbatim | Independent design |
| Hosting | GitHub Pages via Actions on push to `main` | Vercel / Netlify |

## 3. Site structure

Hash-based routing (works on GitHub Pages without a 404 rewrite):

```
#/                          home: topic groups, each a row of algorithm cards
#/<topic>/<algorithm>       one visualization, full-bleed scene + side panel
```

Topics and the registry that populates the home page:

| Topic slug | Title | Release 1 | Roadmap |
|---|---|---|---|
| `calculus` | Calculus | — | derivative & tangent explorer, chain rule graph |
| `linear-algebra` | Linear Algebra | — | matrix transformation (drag a basis, watch a cube deform, determinant, eigenvectors) |
| `machine-learning` | Machine Learning | **gradient-descent** | backprop graph (the `Value` autograd graph from ai-frontier notebook 01, laid out in 3D with forward/backward animation), neural network (layers, activations, weights as edge thickness, live forward pass), GPT transformer (token embeddings, attention heads as weighted arcs, residual stream) |

Roadmap items are listed on the home page as disabled "coming soon" cards so the
structure reads as a curriculum, not a single demo.

## 4. Architecture

```
src/
  main.ts                 boot: theme, router, mount shell
  app/
    router.ts             hash → route object; emits on change
    shell.ts              header (title, breadcrumb, theme toggle), home page, viz page frame
    registry.ts           the list of Visualization objects, grouped by topic
  core/
    renderer.ts           createRenderer(): WebGPURenderer or WebGL fallback, resize, DPR cap
    scene.ts              camera, OrbitControls, lights, grid, shared disposal helper
    theme.ts              reads CSS custom properties → Three.js Color values; re-reads on toggle
    loop.ts               requestAnimationFrame loop with pause when tab hidden
    math/                 pure, framework-free, unit-tested
      surfaces.ts         loss surface definitions f(x,y) and analytic ∇f
      optimizers.ts       sgd, momentum, adam — step(state, grad) → state
      numeric.ts          finite-difference gradient (used by tests to check analytic ∇f)
  ui/
    panel.ts              side panel container
    slider.ts, select.ts, button.ts, readout.ts   small DOM widgets, no framework
    equation.ts           KaTeX render helper with live substitution
  viz/
    types.ts              Visualization interface (below)
    gradient-descent/
      index.ts            the Visualization object
      surface-mesh.ts     builds/updates the surface geometry + contour projection
      marker.ts           draggable ball, gradient arrow, tangent plane
      panel.ts            controls + explanation for this viz
styles/
  tokens.css              copied from knewman23.github.io/styles.css (:root + dark override)
  fonts.css + public/fonts/   self-hosted Space Grotesk and IBM Plex Mono, copied from portfolio
  shell.css, panel.css
```

### The Visualization interface

Every visualization is a folder exporting one object. The shell knows nothing else.

```ts
export interface Visualization {
  id: string;              // "gradient-descent"
  topic: TopicSlug;        // "machine-learning"
  title: string;
  summary: string;         // one sentence for the card
  status: "ready" | "soon";
  mount(host: VizHost): VizInstance;
}

export interface VizHost {
  canvasContainer: HTMLElement;   // scene goes here
  panel: HTMLElement;             // controls + explanation go here
  renderer: Renderer;             // shared, created once per page
  theme: ThemeColors;             // live; emits "change"
}

export interface VizInstance {
  update(dt: number): void;       // called by the loop
  resize(w: number, h: number): void;
  dispose(): void;                // must release all GPU resources and listeners
}
```

Routing to a viz: shell clears the frame, calls `mount`, starts the loop. Leaving:
calls `dispose`, asserts `renderer.info.memory.geometries` returned to baseline in dev mode.

### Theme flow

The portfolio's inline `<head>` script applies `data-theme` before first paint; `theme.js`
owns the toggle. `core/theme.ts` reads `--bg`, `--ink`, `--accent`, `--line`, etc. from
`getComputedStyle(document.documentElement)` into `THREE.Color`s and re-reads on toggle.
Scene materials reference those colours, so the 3D scene flips with the page. Nothing in
the scene has a hard-coded colour.

## 5. Gradient descent visualization

### Scene

- **Surface**: a mesh over a square domain, height = f(x, y). Vertex colour by height using a
  two-stop ramp from `--sunken` to `--accent`. A faint wireframe overlay in `--line`.
  Below the surface at a fixed depth: a projected contour plot (line segments) so students
  connect the 3D bowl to the 2D contour diagrams in textbooks.
- **Marker**: a small sphere at (x, y, f(x, y)). Draggable: pointer ray intersects the surface
  mesh; on drag the marker snaps to the hit point and the path resets.
- **Gradient arrow**: at the marker, arrow along (∂f/∂x, ∂f/∂y, 0) projected onto the surface
  tangent, length scaled by |∇f| and clamped. Colour `--accent`. A second, dimmer arrow shows
  −∇f, the direction the optimizer will actually step.
- **Tangent plane**: a semi-transparent square at the marker, oriented by the normal
  (−f_x, −f_y, 1). Toggleable.
- **Path**: a polyline of all points visited since the last reset, with a small sphere at
  each step. Fades from `--faint` (old) to `--accent` (recent).
- **Camera**: OrbitControls with damping. A "reset view" button.

### Surfaces (all with analytic gradients, all unit-tested against finite differences)

| Key | f(x, y) | Why |
|---|---|---|
| `bowl` | x² + y² | the canonical convex case |
| `elongated` | x² + 10y² | shows zig-zagging and why learning rate matters |
| `saddle` | x² − y² | a critical point that is not a minimum |
| `himmelblau` | (x² + y − 11)² + (x + y² − 7)² | four minima, shows dependence on start |
| `rosenbrock` | (1 − x)² + 100(y − x²)² | the classic narrow valley, scaled for display |

### Controls (side panel)

1. Surface select.
2. Optimizer select: SGD, SGD + momentum (β = 0.9), Adam (β₁ 0.9, β₂ 0.999, ε 1e-8).
3. Learning rate slider, log scale 1e-3 … 1.
4. Step button, Run/Pause toggle (steps at a fixed 10 Hz so the path is watchable), Reset.
5. Toggles: tangent plane, contours, path.

### Explanation panel

Three short paragraphs and live equations, updated every frame:

- What the surface is and what the ball represents (loss as a function of two parameters).
- The gradient: `∇f(x,y) = (∂f/∂x, ∂f/∂y)` rendered by KaTeX, followed by the current numeric
  gradient and its magnitude in a monospace readout.
- The update rule for the selected optimizer, with the current learning rate substituted,
  and one sentence on what to look for (e.g. for `elongated`: "raise the learning rate
  until the path overshoots the narrow axis").

### Readouts

Position (x, y), loss f, gradient (f_x, f_y), |∇f|, step count. Monospace, tabular numbers.

### Interaction details

- Pointer events (mouse + touch). Drag on the marker moves it; drag elsewhere orbits.
- Marker is clamped to the domain. If an optimizer step leaves the domain (large learning
  rate on `rosenbrock`), the run pauses and the readout shows "diverged".
- `prefers-reduced-motion`: Run steps at 2 Hz and camera damping is disabled.
- Keyboard: sliders and buttons are native elements, so tab/arrow keys work.

## 6. Rendering choices

- `three` current release. `WebGPURenderer` from `three/webgpu`; it falls back to WebGL 2
  automatically when `navigator.gpu` is missing. Antialias on. Device pixel ratio capped at 2.
- Surface geometry is 128 × 128 segments (≈33k triangles), rebuilt only on surface change;
  height and colour attributes updated in place.
- Path uses a single `BufferGeometry` with a preallocated capacity of 2,000 points.
- Loop pauses when the tab is hidden and when nothing has changed for one second while not
  running (orbit damping resumes it).

## 7. Build, quality, deploy

- `pnpm` with `vite`, `typescript` (strict, `noUncheckedIndexedAccess`), `three`,
  `@types/three`, `katex`, `vitest`, `eslint` + `typescript-eslint`, `prettier`.
- Tests: Vitest for `core/math/*` — every surface's analytic gradient vs finite differences
  at 25 random points (tolerance 1e-4); each optimizer converges on `bowl` within N steps;
  Adam bias correction matches the paper's closed form for the first three steps.
  Rendering is verified manually in Chrome during development (screenshots in the PR).
- CI (`.github/workflows/ci.yml`): typecheck, lint, test on every push and PR.
- Deploy (`.github/workflows/pages.yml`): build with `base: "/ai-lab/"` and publish `dist/`
  to GitHub Pages on push to `main`.
- README: what it is, screenshot, how to run, how to add a visualization (the interface
  above and a 10-line example), roadmap, links to the sibling repos.

## 8. Portfolio integration

After the first deploy, add a card to knewman23.github.io linking to
`https://knewman23.github.io/ai-lab/`, alongside the ai-frontier and backprop-to-frontier
cards. That change lives in the portfolio repo and is not part of this project's scope.

## 9. Roadmap (each is its own spec → plan → implementation cycle)

1. **Backprop graph** (machine-learning) — the `Value` autograd graph from ai-frontier
   notebook 01 laid out in 3D; edit inputs, watch forward values and backward gradients flow.
2. **Matrix transformation** (linear-algebra) — drag basis vectors, watch a unit cube and a
   point cloud deform; show determinant as volume, eigenvectors as the lines that don't turn.
3. **Neural network** (machine-learning) — a small MLP; layers as planes, weights as edge
   thickness/colour, a live forward pass on a 2D classification problem, train with the
   optimizers from this release.
4. **GPT transformer** (machine-learning) — a tiny transformer block; token embeddings as
   points, attention heads as weighted arcs between tokens, residual stream as a spine.
5. **Derivative & tangent explorer** (calculus) — 1D function, tangent line, secant → tangent
   limit animation; a stepping stone to the surface scene.
6. **Walkthrough mode** (shell) — optional numbered steps that reconfigure any scene.

## 10. Open questions for the owner

- Repo name: `ai-lab` is a placeholder. Alternatives: `frontier-lab`, `ml-viz`.
- Should the home page show roadmap cards as "coming soon", or only shipped ones?
