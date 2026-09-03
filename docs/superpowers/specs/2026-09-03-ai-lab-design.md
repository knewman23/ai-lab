# AI Lab — interactive 3D visualizations for calculus, linear algebra and machine learning

Date: 2026-09-03
Status: reviewed, awaiting owner sign-off
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
guided lesson mode. Mobile gets one rule: below 800px the panel stacks under the scene,
which takes a 4:3 viewport.

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
structure reads as a curriculum, not a single demo (default pending the owner's answer in
§10). An unknown hash, or the id of a "soon" entry typed directly, redirects to `#/`.

## 4. Architecture

```
index.html                <head> carries the portfolio's inline theme script verbatim
public/theme.js           the portfolio's toggle script, copied verbatim
src/
  main.ts                 boot: theme, shell, router first; then await createRenderer()
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
Roadmap entries are a separate, mount-less type so the registry can hold both.

```ts
export interface RoadmapEntry {
  id: string;              // "backprop-graph"
  topic: TopicSlug;        // "machine-learning"
  title: string;
  summary: string;         // one sentence for the card
  status: "soon";
}

export interface Visualization extends Omit<RoadmapEntry, "status"> {
  status: "ready";
  mount(host: VizHost): VizInstance;
}

export type RegistryEntry = Visualization | RoadmapEntry;

/** The WebGPURenderer class from "three/webgpu"; it also backs the WebGL 2 fallback. */
export type Renderer = import("three/webgpu").WebGPURenderer;

export interface ThemeColors extends EventTarget {   // dispatches "change" on toggle
  bg: Color; card: Color; sunken: Color; ink: Color; soft: Color; faint: Color;
  line: Color; accent: Color;
}

export interface VizHost {
  canvasContainer: HTMLElement;   // the renderer's canvas is already attached here
  panel: HTMLElement;             // controls + explanation go here
  renderer: Renderer;             // shared, created once per page load, already init()ed
  theme: ThemeColors;
}

export interface VizInstance {
  update(dt: number): boolean;    // called by the loop; the viz calls renderer.render itself
                                  // and returns true if it rendered. Loop idles after 1 s of false.
  resize(w: number, h: number): void;  // shell has already called renderer.setSize
  dispose(): void;                // must release all GPU resources and listeners
}
```

Ownership: the shell owns the renderer (one per page load, since `WebGPURenderer.init()`
is async) and the loop. Each viz owns its scene, camera and OrbitControls, built with the
helpers in `core/scene.ts`, and renders itself inside `update`. That gives the viz direct
access to the controls it needs (reset view, disable orbit while dragging, damping off under
reduced motion) without widening `VizHost`.

Boot order: theme, shell and router come up first and never depend on the renderer. The
shell then awaits `createRenderer()` once. If it resolves, viz routes mount normally. If it
rejects for any reason (no WebGPU and no WebGL 2, blocked GPU, context loss during init),
the shell never calls `mount`; a viz route instead shows
a plain-HTML notice in place of the whole viz frame naming the requirement and linking to the
ai-frontier notebook for the same topic. The home page still works. `VizHost.renderer` stays
a required `Renderer`.

Routing to a viz: shell clears the frame, calls `mount`, starts the loop, and attaches a
`ResizeObserver` to `canvasContainer` that calls `resize`. Leaving: calls `dispose`, asserts
`renderer.info.memory.geometries` returned to baseline in dev mode.

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
  Below the surface at a fixed depth: a projected contour plot (marching squares over the
  same height grid, 12 levels evenly spaced across the displayed height range) so students
  connect the 3D bowl to the 2D contour diagrams in textbooks.
- **Marker**: a small sphere at (x, y, s·f(x, y)), the display height. Draggable: the pointer ray hits an invisible
  horizontal plane at the marker's current height, giving (x, y); z is then s·f(x, y) evaluated
  analytically, so the marker never leaves the surface under cursor jitter. Dragging resets
  the path and the optimizer state (see Interaction details). Orbit is disabled during a drag.
- **Gradient arrow**: at the marker, xy direction along the true ∇f, lifted to lie in the
  drawn surface's tangent plane (see Surfaces for the display-space rule). Length is
  0.15 × |∇f| in display units, clamped to [0.2, 1.5]. Colour `--accent`. A second, dimmer
  arrow shows −∇f, the direction the optimizer will actually step.
- **Tangent plane**: a semi-transparent square, side 1.2 display units, at the marker,
  oriented by the display-space normal (−s·f_x, −s·f_y, 1). Toggleable.
- **Path**: a polyline of all points visited since the last reset, with a small sphere at
  each step. Fades from `--faint` (old) to `--accent` (recent). Capacity 2,000 points, used
  as a ring buffer: the oldest point drops off once full. The step-count readout is not
  bounded by path capacity.
- **Camera**: OrbitControls with damping. A "reset view" button.

### Surfaces (all with analytic gradients, all unit-tested against finite differences)

Readouts and optimizer steps always use the true f and ∇f. Scene geometry lives in display
space: with scale s, the drawn surface is z = s·f(x, y), so the marker height, contour heights,
colour ramp, tangent plane normal (−s·f_x, −s·f_y, 1) and the gradient arrow's vertical lift
all use s·f. The arrow's direction in the xy plane is the true ∇f; only its z component is
scaled to stay tangent to the drawn surface. Each surface has a default start point that shows off its behaviour.

| Key | f(x, y) | Domain | Display scale | Start | Why |
|---|---|---|---|---|---|
| `bowl` | x² + y² | [−3, 3]² | 1/6 | (2.5, 2) | the canonical convex case |
| `elongated` | x² + 10y² | [−3, 3]² | 1/30 | (2.5, 1.5) | shows zig-zagging and why learning rate matters |
| `saddle` | x² − y² | [−3, 3]² | 1/6 | (2.5, 0.05) | a critical point that is not a minimum |
| `himmelblau` | (x² + y − 11)² + (x + y² − 7)² | [−5, 5]² | 1/300 | (0, 0) | four minima, shows dependence on start |
| `rosenbrock` | (1 − x)² + 100(y − x²)² | x ∈ [−2, 2], y ∈ [−1, 3] | 1/800 | (−1.5, 2.5) | the classic narrow valley |

### Controls (side panel)

1. Surface select (default `bowl`).
2. Optimizer select: SGD (default), SGD + momentum (β = 0.9), Adam (β₁ 0.9, β₂ 0.999, ε 1e-8).
3. Learning rate slider, log scale 1e-3 … 1, default 0.1.
4. Step button, Run/Pause toggle (steps at a fixed 10 Hz so the path is watchable), Reset.
5. Toggles: tangent plane, contours, path.

### Explanation panel

Three short paragraphs and live equations. KaTeX structure is rendered once per
optimizer/surface change; the numeric readouts inside it update on state change (step or
drag), never per frame.

- What the surface is and what the ball represents (loss as a function of two parameters).
- The gradient: `∇f(x,y) = (∂f/∂x, ∂f/∂y)` rendered by KaTeX, followed by the current numeric
  gradient and its magnitude in a monospace readout.
- The update rule for the selected optimizer, with the current learning rate substituted,
  and one sentence on what to look for (e.g. for `elongated`: "at a learning rate of 0.1
  the narrow axis neither settles nor blows up: nudge the rate below 0.1 to converge, above it
  to diverge"; for `saddle`: "the ball slides off along y
  until it leaves the domain: that's the optimizer escaping a saddle").

### Readouts

Position (x, y), loss f, gradient (f_x, f_y), |∇f|, step count. Monospace, tabular numbers.

### Interaction details

- Pointer events (mouse + touch). Drag on the marker moves it; drag elsewhere orbits.
- Marker is clamped to the domain while dragging. If an optimizer step leaves the domain, or
  produces NaN or ±Infinity (large learning rate on `rosenbrock`), the run pauses and Step and
  Run are disabled until Reset or a drag. The readout says "left the domain" for a finite
  point outside it and "diverged" for NaN or ±Infinity.
- Optimizer state (momentum velocity; Adam m, v, t) and the step count reset to zero on: drag,
  Reset, surface change, optimizer change. Changing the learning rate mid-run keeps state.
  Reset returns the marker to the surface's start point. Surface change behaves like Reset on
  the new surface (marker to its start, path cleared); optimizer change keeps the marker and
  clears the path.
- `prefers-reduced-motion`: Run steps at 2 Hz and camera damping is disabled.
- Keyboard: sliders and buttons are native elements, so tab/arrow keys work.

## 6. Rendering choices

- `three` current release. `WebGPURenderer` from `three/webgpu`; it falls back to WebGL 2
  automatically when `navigator.gpu` is missing. Antialias on. Device pixel ratio capped at 2.
- Surface geometry is 128 × 128 segments (≈33k triangles), rebuilt only on surface change;
  height and colour attributes updated in place.
- Path uses a single `BufferGeometry` with a preallocated capacity of 2,000 points.
- Loop pauses when the tab is hidden, and idles when `update` has returned false for one
  second. Any pointer event or control change on the viz page resumes it; the viz returns
  true while orbit damping is still settling.
- On resize the shell calls `renderer.setSize` and `setPixelRatio`, then `viz.resize`.

## 7. Build, quality, deploy

- `pnpm` with `vite`, `typescript` (strict, `noUncheckedIndexedAccess`), `three`,
  `@types/three`, `katex`, `vitest`, `eslint` + `typescript-eslint`, `prettier`.
  KaTeX's CSS and fonts are bundled from the npm package, not loaded from a CDN, matching
  the portfolio's self-hosted fonts.
- Tests: Vitest for `core/math/*` — every surface's analytic gradient vs finite differences
  at 25 random points in its domain (relative tolerance 1e-4); each optimizer reaches
  |∇f| < 1e-3 on `bowl` from (2.5, 2) within 200 steps at learning rate 0.1 (Adam oscillates
  near a quadratic minimum; loosen its budget rather than "fix" the optimizer if it misses);
  Adam bias correction matches the paper's closed form for the first three steps;
  a run that leaves the domain (rosenbrock, SGD, lr 1 exits on the first step while still
  finite) is reported as "left the domain", and a run whose step produces NaN or ±Infinity is
  reported as "diverged"; neither throws.
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
