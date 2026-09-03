# Chain rule graph — a three-wall corner where slopes multiply

Date: 2026-09-03
Status: draft (revision 1)
Parent: [AI Lab design](2026-09-03-ai-lab-design.md); siblings: [Derivative explorer](2026-09-03-derivative-explorer-design.md), [Matrix transformation](2026-09-03-matrix-transformation-design.md)
Registry: replaces the `calculus` roadmap entry `chain-rule-graph`

## 1. Purpose

Show why (f∘g)′(x) = f′(g(x))·g′(x) geometrically. The inner function u = g(x) is drawn on a
front wall, the outer function y = f(u) on a side wall that shares the wall's vertical u axis, and
the composite y = f(g(x)) on the floor that shares the front wall's x axis and the side wall's y
axis. A draggable x and a small Δx produce a right triangle on each face; the Δu leg is the same
height span on both walls and the Δy leg the same depth span on the side wall and the floor, so
Δy/Δx = (Δy/Δu)·(Δu/Δx) is a picture, not just an identity. Shrink Δx and the three secants
rotate onto the three tangents.

Success criteria: two clicks from the home page; 60 fps while dragging; every readout matches an
independent calculation; the three ratio readouts satisfy the product identity to display
precision at every Δx; at Δx = 1e-3 each ratio agrees with its derivative to three significant
figures on `sin3x`; the composite point on the floor visibly sits at the corner of the rectangle
closed by the connectors.

Out of scope: more than two stages, user-typed functions, animation of the Δ pulse, zoom, the
derivative curve band (the derivative scene owns that lesson), non-differentiable presets.

## 2. Decisions

| Question | Decision | Alternatives |
|---|---|---|
| Metaphor | Stages as linked curve panels with edges between the shared quantities | Pure node graph; single composite curve with an inset |
| Depth | Two stages fixed, presets pick (g, f) | Selectable third stage; composable stages |
| Propagation control | Log slider for Δx with live Δ triangles and secants, as h in the derivative scene | Animated pulse; both |
| Layout | Three mutually perpendicular faces meeting at a corner (front wall, side wall, floor) | Three flat panels on one vertical plane |
| Faces | Translucent quads with depth on, lines lifted 0.01 off each face toward the corner's interior | Flat no-depth layers (wrong for three non-coplanar faces) |
| Dragging | The front-wall point on the plane y = 0 and the floor point on the plane z = 0; both set x | One draggable only |

## 3. Scene

Shared Z-up scene kit (`createSceneKit`). The scene is a 6 × 6 × 6 corner with vertex at
(−3, 0, 0): x ∈ [−3, 3], y ∈ [0, 6], z ∈ [0, 6] in world units. Colours from `ThemeColors`; no
new tokens.

### 3.1 Faces and display mapping

Each preset carries two display scales sᵤ and s_y (§4). Display coordinates:

| Face | Plane | Axis 1 | Axis 2 | Curve, 241 samples | Clip box (face-local, half-extents) |
|---|---|---|---|---|---|
| Front wall | y = 0 | X = x, x ∈ [−3, 3] | Z = 3 + sᵤ·u | u = g(x) | centre (0, 3), half (3, 3) |
| Side wall | x = −3 | Y = 3 + s_y·y (depth) | Z = 3 + sᵤ·u | y = f(u) for u ∈ [−3/sᵤ, 3/sᵤ], i.e. the u range the wall spans; samples where f is undefined (NaN) are dropped, splitting the run | centre (3, 3), half (3, 3) |
| Floor | z = 0 | X = x | Y = 3 + s_y·y | y = f(g(x)) | centre (0, 3), half (3, 3) |

Curves are written with the derivative scene's `writeClippedPolyline` pattern: clip each sample
segment to the face box with `clipSegment` (in face-local coordinates centred on the face, then
translated), drop degenerate pieces, draw as `LineSegments` so gaps survive. `layer.ts` moves from
`viz/derivative/` to `viz/shared/layer.ts`; it gains a `plane` parameter so a layer can write its
two face coordinates into any pair of world axes (front wall → (X, ·, Z), side wall → (·, Y, Z),
floor → (X, Y, ·)) with the third axis fixed at the face's offset plus a 0.01 lift toward the
interior (+y for the front wall, +x for the side wall, +z for the floor). Lines on faces keep
`depthTest: true`, `depthWrite: false`, `transparent: true`; `renderOrder` orders coplanar layers
on the same face. The derivative scene keeps working unchanged through a re-export or import
update (its layers use the front-wall plane with zero lift).

Faces: three `PlaneGeometry(6, 6)` meshes, `MeshBasicMaterial({ color: --faint, transparent:
true, opacity: 0.35, side: DoubleSide, depthWrite: false })`, `renderOrder 0`. Outlines: one
`LineSegments` layer of the nine corner edges in `--line`.

Axes (`--line`, order 1): front wall x axis (Z = 3, u = 0) and the shared vertical edge at
(−3, 0); side wall y axis (Z = 3); floor x axis (Y = 3) and y axis (X = −3). Unit ticks (length
0.12) on the front wall x axis and the floor x axis only; the u and y axes are scaled per preset
so ticks there would mislead. Labels are out of scope; the panel names the axes.

### 3.2 Points, connectors, triangles

Notation: P = (x, g(x)) on the front wall, Q = (u, f(u)) on the side wall, R = (x, f(g(x))) on the
floor; P′, Q′, R′ the same at x + Δx.

| Order | Layer | Colour | Notes |
|---|---|---|---|
| 2 | Curves | `--ink` | one layer per face |
| 3 | Connectors | `--soft`, opacity .8 | at P's height: P → (−3, 0, Z_u) along −x; → Q along +y on the side wall; Q → (−3, Y_y, 0) down the side wall; → R along +x on the floor; P → (x, 0, 0) down the front wall; (x, 0, 0) → R along +y on the floor. The closed rectangle on the floor and the two on the walls are the proof that R is the composite. Toggle "Connectors" |
| 4 | Primed connectors | `--faint`, opacity .6 | the same six segments for P′, Q′, R′; shown only when Δx_eff ≠ null and the connectors toggle is on |
| 5 | Δ triangles | `--soft`, opacity .9 | front wall: P → (x + Δx, u) → P′; side wall: Q → (u + Δu, y) → Q′; floor: R → (x + Δx, y) → R′. Each triangle is the two legs (horizontal then vertical/depth) plus the hypotenuse, which is the secant through the two points, extended and clipped to the face box. Toggle "Δ triangles" (legs) and "Secants" (hypotenuses) |
| 6 | Tangents | `--accent` | through P with display slope sᵤ·g′(x) in (X, Z); through Q with the display slope from §4 `sideSlope`; through R with display slope s_y·(f∘g)′(x) in (X, Y). Extended and clipped to the face box. Toggle "Tangents", off by default so the secants read first |
| 10 | Points | 3D, depth on, `transparent: true` | P `--ink` r 0.08 (draggable; hit sphere r 0.2 invisible); Q `--soft` r 0.07; R `--ink` r 0.08 (draggable); P′, Q′, R′ `--soft` r 0.05, hidden with the primed connectors |

Side-wall triangle: legs run from Q vertically to height u + Δu, then in depth to Q′. Front-wall
triangle legs: horizontal from P to x + Δx at height u, then vertical to P′. Floor triangle legs:
along x from R to x + Δx at depth y, then along y to R′. Legs are drawn even when a leg has zero
length (the segment collapses; nothing special is done).

Drag targets: P drags on the plane y = 0 (`plane: { normal: (0, 1, 0), getOffset: () => 0 }`,
hit reports `[x, 0]`); R drags on the floor (`getPlaneZ: () => 0`, hit reports `[x, y]`). Both
map `pos[0]` → `setX`. The shared drag takes exactly one plane option, so two `attachDrag` calls
are made, one per target, each with its own hit target; only the front-wall call gets the
`surfaceTarget` click plane (`PlaneGeometry(6, 6)` at the front wall, invisible material,
`DoubleSide`). Orbit elsewhere.

### 3.3 Camera

`frame-corner.ts`: target (0, 3, 3); position (0, 3, 3) + 6.5·(1.35, −1.6, 0.9) ≈ (8.8, −7.4,
8.85), up +Z. This looks at the corner's interior from the +x, −y, +z octant: the front wall
nearly face-on, the side wall's inner face at about 40°, the floor from about 35° above. The plan
may tune the offset by up to 20% after a screenshot; the spec fixes the octant and the target.
Reset view restores it instantly.

## 4. Math (`core/math/compositions.ts`, pure, unit-tested)

```ts
export type CompKey = "sin3x" | "sinsq" | "gauss" | "sqrtq" | "sincube";
export interface Composition {
  readonly key: CompKey; readonly title: string;
  readonly tex: string;       // y = f(g(x)) expanded, e.g. \sin 3x
  readonly texG: string;      // u = g(x)
  readonly texF: string;      // y = f(u)
  readonly texPrime: string;  // the chain rule written out, e.g. \cos(3x)\cdot 3
  readonly g: (x: number) => number; readonly dg: (x: number) => number;
  readonly f: (u: number) => number; readonly df: (u: number) => number; // NaN where undefined
  readonly su: number;        // sᵤ
  readonly sy: number;        // s_y
  readonly start: number;
  readonly hint: string;
}
export const COMPOSITIONS: Readonly<Record<CompKey, Composition>>; export const COMP_KEYS;
export const DOMAIN = [-3, 3]; export const DX_RANGE = [1e-3, 2]; export const FACE = 6;
```

| Key | y | g | f | sᵤ | s_y | start | Why |
|---|---|---|---|---|---|---|---|
| `sin3x` | sin 3x | 3x | sin u | 1/3 | 2.5 | 0.4 | linear inner: the slope is just ×3 |
| `sinsq` | sin x² | x² | sin u | 1/3 | 2.5 | 1.2 | inner slope grows with x; the composite oscillates faster |
| `gauss` | e^(−x²/2) | −x²/2 | eᵘ | 2/3 | 2.5 | 1 | the bell curve; f′ = f; side curve clipped above u ≈ 0.18 |
| `sqrtq` | √(x²+1) | x² + 1 | √u | 0.3 | 0.9 | 1.5 | f undefined for u < 0: the side curve starts at the u axis |
| `sincube` | sin³x | sin x | u³ | 3 | 2.5 | 0.8 | g′ = cos x zeroes the product at the peaks |

Helpers:

- `evaluate(c, x)` → `{ u, y, dg, df, dydx }` with `dydx = df(u)·dg(x)`.
- `effectiveDx(x, dx)` = min(dx, 3 − x); `null` when < 1e-9 (x at the right edge).
- `deltas(c, x, dxEff)` → `{ du, dy, duDx, dyDu, dyDx }` with `du = g(x+Δx) − g(x)`,
  `dy = f(g(x+Δx)) − f(g(x))`, `duDx = du/Δx`, `dyDu = |du| < 1e-9 ? null : dy/du`,
  `dyDx = dy/Δx`.
- `sideSlope(c, u)`: the side-wall tangent's display slope dZ/dY = sᵤ/(s_y·f′(u)); `"vertical"`
  when |f′(u)| < 1e-9 (a stationary f); `null` when f′(u) is NaN. The side wall's independent
  variable runs vertically, so the tangent is expressed as height per depth and drawn from the
  slope in that orientation, or as a vertical segment when f′ = 0.

Sampling (`core/math/sampling1d.ts` gains `sampleOn(fn, [a, b], n = 241)` returning `{ T, V }`
with `V[i] = fn(T[i])`; NaN passes through and the layer writer skips segments touching a NaN).

Tests: `dydx` matches a central difference of `x ↦ f(g(x))` (rel 1e-4) at 25 seeded points for
every preset, skipping points where the composite is undefined; `dyDx` equals `dyDu·duDx` within
1e-9 wherever `dyDu !== null`, at 25 seeded (x, Δx) pairs per preset; `deltas(sin3x, 0, 1e-3).duDx`
= 3 to 1e-9; on a 601-point grid over the domain, |sᵤ·g(x)| ≤ 3 + 1e-9 and |s_y·f(g(x))| ≤ 3 +
1e-9 for every preset; `effectiveDx(2.5, 1)` = 0.5, `effectiveDx(3, 1)` = null;
`sideSlope(sincube, 0)` is `"vertical"`; `sideSlope(sqrtq, −1)` is null; the table's scale and
start values.

## 5. State (`viz/chain-rule/state.ts`, pure, unit-tested)

```ts
interface ChainState {
  readonly comp: CompKey; readonly x: number; readonly dx: number;
  readonly show: { triangles: boolean; secants: boolean; tangents: boolean; connectors: boolean };
}
```

`initialState()`: `sin3x`, x = start, Δx = 0.5, triangles/secants/connectors on, tangents off.
Reducers: `setComp(s, key)` (x → that preset's start, Δx unchanged), `setX(s, x)` (clamp to
[−3, 3]), `setDx(s, dx)` (clamp to `DX_RANGE`), `setShow(s, key, on)`, `reset(s)` (x → start,
Δx → 0.5, show unchanged). `derived(s)`: `evaluate` fields, `dxEff`, `deltas` (or null when
`dxEff` is null), `sideSlope`.

Tests: each reducer's clamp and no-op behaviour; `derived` at the default state agrees with the
math helpers; `setComp` resets x to the new start.

## 6. Controls (side panel, in order)

1. Composition select (table order, titles like "sin 3x").
2. Δx slider (log, 1e-3 … 2, default 0.5, readout `Δx = <fmt>`), with the derivative scene's
   rewritten note: hidden normally; "clipped to <fmt(dxEff)> so x + Δx stays in the domain" when
   dxEff ≠ dx; "x is at the right edge; no Δ" when dxEff is null.
3. Buttons: Reset, Reset view.
4. Toggles: Δ triangles, Secants, Tangents, Connectors.

Readouts, grouped:

- Values: x; u = g(x); y = f(u).
- Derivatives: g′(x); f′(u) ("undefined" when NaN); dy/dx = f′(u)·g′(x).
- Ratios (or "—" when dxEff is null): Δu/Δx; Δy/Δu ("— (Δu = 0)" when null); Δy/Δx.

Explanation (`createEquation` for structure, plain spans for numbers):

- Chain rule: `\frac{dy}{dx} = \frac{dy}{du}\cdot\frac{du}{dx}` and the preset's `tex`, `texG`,
  `texF`, `texPrime`; text: "At x = <x>: g′(x) = <dg> on the front wall, f′(u) = <df> on the
  side wall, so the floor slope is <dg> × <df> = <dydx>."
- Finite version: `\frac{\Delta y}{\Delta x} = \frac{\Delta y}{\Delta u}\cdot\frac{\Delta u}{\Delta x}`;
  text: "With Δx = <dxEff>: <duDx> × <dyDu> = <dyDx>. The Δu leg is the same height on both walls;
  the Δy leg is the same depth on the side wall and the floor. Shrink Δx and each ratio becomes
  its derivative." When Δy/Δu is null: "Δu is 0 here, so the middle ratio is undefined, but Δy is
  0 too and Δy/Δx = 0." When dxEff is null: "Move x left of the edge to see the triangles."
- The preset's `hint`.

## 7. Interaction details

- Drag P or R (§3.2); click anywhere on the front wall places x. Grab cursor over both points.
- Nothing animates apart from camera damping; `apply` sets `dirty`, one frame renders per change.
- Hint (shared, key `ai-lab.hint.chain-rule`): "Drag the black point on the front wall or the
  floor, or click the wall to move it."; "Shrink Δx to watch the three secants become tangents.";
  "Orbit to see the Δu leg shared by both walls."
- Reset view restores the home framing instantly.

## 8. Files and shared changes

```
src/core/math/compositions.ts                       + tests
src/core/math/sampling1d.ts   + sampleOn            + tests
src/viz/shared/layer.ts       moved from viz/derivative/layer.ts; gains a face plane
                              (which world axes the two face coordinates land on, the fixed
                              third coordinate, and the lift); derivative imports updated,
                              its tests unchanged
src/viz/chain-rule/
  index.ts          Visualization (mirrors derivative/index.ts: buildScene with unwind, panel
                    declared before apply, theme "change" → dirty, two attachDrag calls, dispose
                    order theme listener → drags → hint → scene objects (reverse build order) →
                    disposeObject → kit → panel)
  state.ts          reducers above                                     + tests
  frame-corner.ts   home framing (§3.3)
  faces.ts          three translucent quads, corner outline, axes and ticks
  curves.ts         three face curves, resampled only when the preset changes
  links.ts          connectors, primed connectors, triangle legs, secants, tangents
  points.ts         six spheres, two hit spheres, invisible click plane
  panel.ts          controls, readouts, explanation wiring
  explanation.ts    KaTeX strings and the text builders                 + tests
src/app/registry.ts   chain-rule-graph → status "ready", load: () => import("../viz/chain-rule")
README.md             roadmap item struck through with a one-line description; scene list
```

Testing beyond the unit tests above: the existing registry test covers the new entry; a
mount/dispose test in the style of the other scenes (mock renderer) checks no geometry leaks;
a manual pass (screenshot at the home framing, Δx at 2, 0.5 and 1e-3 on `sin3x`, each preset
once, both drags, click-to-place, theme toggle) before merge.

## 9. Risks

- **Occlusion.** The side wall can hide the floor's far corner at some orbit angles. Faces are
  translucent (opacity .35) and lines are lifted, so the curves stay visible through a face.
- **Steep side curves.** `gauss` and `sqrtq` leave the wall; clipping handles it, and the panel's
  hint says so for those presets.
- **Δu = 0.** Handled in `deltas` and the explanation.
- **Two drag attachments.** Each has one hit target, so a press can hit at most one; orbit
  suspension is per attachment and restores the same `controls.enabled` value.
