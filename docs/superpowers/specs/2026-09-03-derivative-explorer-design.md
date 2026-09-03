# Derivative and tangent explorer — a 1D function, its tangent, the secant limit and f′

Date: 2026-09-03
Status: approved by spec review (revision 3)
Parent: [AI Lab design](2026-09-03-ai-lab-design.md); sibling: [Matrix transformation](2026-09-03-matrix-transformation-design.md)
Registry: replaces the `calculus` roadmap entry `derivative-tangent`

## 1. Purpose

Make the derivative visible three ways at once: as the slope of the tangent at a draggable point,
as the limit of secant slopes as h shrinks, and as the height of a second curve f′(x) drawn
underneath that tracks the same x. A "Zoom in" control re-samples the function in a shrinking
window around the point so the curve visibly becomes its tangent, which is what differentiability
means. Two functions are deliberately not differentiable at one point so the failure modes are
shown, not just described.

Success criteria: two clicks from the home page; 60 fps while dragging; every readout matches an
independent calculation; secant slope visibly converges to f′ as h → 0; at x = 0 on |x| (reachable
by snapping) the panel says why there is no tangent; three zoom steps on x² make the curve
indistinguishable from its tangent.

Out of scope: user-typed functions, higher derivatives, integrals, parametric curves, left-hand
secants (h is positive; the corner is explained in text).

## 2. Decisions

| Question | Decision | Alternatives |
|---|---|---|
| Layout | Curve on the vertical plane y = 0 (x → world x, f → world z); f′ curve on the same plane below it; camera on the −y side like every scene | Two planes at different depths; a 2D canvas |
| Secant control | Log slider for h, 1e-3 … 2, default 1, positive only | Signed h (roadmap if the corner demo needs it) |
| Non-differentiable points | Explicit classification (value, jump, vertical) plus snapping to the singular x when dragged within 0.02 | Silent numeric derivative |
| Zoom | Domain rescale about the point by ×4 per step, up to 3 steps (×64); camera does not move | Camera fly-in (cannot get close enough within the near plane; foreshortens) |
| Dragging | Shared drag with a new drag-plane option (vertical plane, normal +y) | Bespoke pointer code |

## 3. Scene

Shared Z-up scene; everything lies on the plane y = 0 and the camera sits on the −y side. Display
space: the main curve is Z = s·f(x) with a per-function scale s so |Z| ≤ 3 on the domain; the
derivative curve is Z = z₀ + s′·f′(x) with z₀ = −6 and its own scale s′ so it fits the band
[−8.5, −3.5]. Domain x ∈ [−3, 3]. Framing is local to the scene (`frame-vertical.ts`, five lines):
target (0, 0, −2.75), camera (0, −D, −2.75) with D = max(5.75, 3) / tan(22.5°) × 1.15 ≈ 16, up +Z.

**Zoom.** State holds `zoom ∈ {0, 1, 2, 3}`, K = 4^zoom. When zoom > 0 the main region shows the
window [x − 3/K, x + 3/K] re-sampled with 241 points and drawn in display coordinates
X = (x′ − x)·K, Z = s·(f(x′) − f(x))·K, so the point sits at (0, 0), the tangent keeps its display
slope s·f′(x), and the curve converges to that line as K grows. The secant point at x + h is shown
only if it lies inside the window. The derivative band, its axis, guides and marker are hidden
while zoomed. Tick labels are out of scope, so the readout "Window: [x−w, x+w]" states the window.
The window may extend past the domain (at x = 3, zoom 1 it is [2.25, 3.75]); every f is defined on
all of ℝ, so sampling there is safe. The zoomed main curve is clipped to the same display box as
the lines (X ∈ [−3.5, 3.5], Z ∈ [−3.4, 3.4]) so a steep curve does not run through the hidden band.
Dragging is disabled while zoomed (`enabled` predicate) and the panel note says "Reset zoom to
move the point"; click-to-place is disabled too. The sampling is a pure function
`zoomSamples(fn, x, K, n = 241): { X: Float32Array; Z: Float32Array }` in `functions1d.ts`, tested
so that the maximum |Z − s·f′(x)·X| over the window falls by at least 3× per zoom step for
`square` (it scales as 1/K).

Flat layers (`transparent: true`, `depthTest: false`, `depthWrite: false`, explicit `renderOrder`,
as in the matrix scene). All `Line`s are drawn as `LineSegments` from preallocated buffers so gaps
are possible:

| Order | Layer | Colour | Notes |
|---|---|---|---|
| 1 | Axes | `--line` | x axis (Z = 0) and Z axis for the main region; x axis at z₀ for the derivative band; unit ticks (hidden when zoomed); a `--faint` separator at Z = −3.45 (above the band top −3.5 and clear of the ±3.4 tangent clip) |
| 2 | Derivative curve | `--soft` | 241 samples; split into runs at the function's `singularAt` so a jump shows two flat runs with a gap and no riser, and √\|x\| shows two arms rising to the band clamp; toggleable |
| 3 | Main curve | `--ink` | 241 samples over the domain or the zoom window |
| 4 | Secant line | `--soft`, opacity .8 | through the point and the secant point, extended in display x to ±3.5 and clipped to Z ∈ [−3.4, 3.4] with `clipSegment`; hidden when the secant is degenerate (`secant === null`) or the secant point is outside the zoom window; toggleable |
| 5 | Tangent line | `--accent` | through the point with display slope s·f′(x), extended and clipped the same way; hidden for a jump; for a vertical tangent a vertical segment X = const spanning the clip box |
| 6 | Guides | `--faint`, opacity .6 | a vertical from the point down to the derivative marker and a short horizontal at the marker's height; hidden when the derivative curve is hidden, f′ is undefined, or zoomed |
| 10 | Points | 3D, depth on, `transparent: true` | main point r 0.08 `--ink` (draggable; hit sphere r 0.2 with an invisible material); secant point r 0.06 `--soft` (hidden with the secant); derivative marker r 0.06 `--accent` at (x, z₀ + s′·f′(x)), hidden when f′ is undefined or zoomed |

Click-to-place target: `PlaneGeometry(7, 12)` rotated with `rotation.x = π/2` so it lies in y = 0,
positioned at (0, 0, −2.75) so it covers Z ∈ [−8.75, 3.25], `MeshBasicMaterial({ visible: false,
side: DoubleSide })` (material invisibility keeps it raycastable), disposed with the scene.

Colours from `ThemeColors`; no new tokens.

## 4. Math (`core/math/functions1d.ts`, pure, unit-tested)

```ts
export type Derivative =
  | { kind: "value"; v: number }
  | { kind: "jump"; left: number; right: number }
  | { kind: "vertical" };
export interface Fn1D {
  readonly key: FnKey; readonly title: string;
  readonly tex: string;        // KaTeX for f(x)
  readonly texPrime: string;   // KaTeX for f′(x)
  readonly f: (x: number) => number;
  readonly d: (x: number) => Derivative;
  readonly scale: number;      // s
  readonly primeScale: number; // s′
  readonly start: number;
  readonly singularAt: number | null;  // snap target for dragging
  readonly hint: string;
}
export const FNS: Readonly<Record<FnKey, Fn1D>>; export const FN_KEYS;
```

| Key | f | f′ | s | s′ | start | singularAt | Why |
|---|---|---|---|---|---|---|---|
| `square` | x² | 2x | 1/3 | 1/2.4 | 1.5 | null | the first derivative everyone meets |
| `cubic` | x³ − 3x | 3x² − 3 | 1/6 | 1/9.6 | 0.8 | null | turning points where f′ = 0 |
| `sine` | sin x | cos x | 2 | 2 | 1 | null | f′ is another familiar curve |
| `exp` | eˣ⁄5 | eˣ⁄5 | 0.59 | 0.59 | 1 | null | f′ = f (e³/5 = 4.017; ×0.59 = 2.37) |
| `abs` | \|x\| | sign(x); jump at 0 | 1 | 2 | 1.2 | 0 | no tangent at the corner |
| `sqrtabs` | √\|x\| | sign(x)/(2√\|x\|); vertical at 0 | 1.5 | 1 | 1 | 0 | vertical tangent, f′ → ±∞ (display clamped to the band) |

`d(x)` returns `jump {left: −1, right: 1}` for `abs` when |x| < 1e-9, `vertical` for `sqrtabs` when
|x| < 1e-9, otherwise `value`. Because 1e-9 is unreachable by dragging, the state reducer snaps x
to `singularAt` when |x − singularAt| < 0.02 (§5). `secantSlope(fn, x, h)` = (f(x+h) − f(x))/h.
`effectiveH(x, h)` = min(h, 3 − x) (so x + h stays in the domain); `null` when that is < 1e-9.
Display clamping of the derivative curve for `sqrtabs` is done by the scene (clamp Z to the band).

Tests: every `value` derivative matches central differences (rel 1e-4) at 25 seeded points with
|x| > 0.05; `FNS.abs.d(0)` is `jump {−1, 1}`; `FNS.sqrtabs.d(0)` is `vertical`;
`secantSlope(FNS.square, 1, h)` is close to 2 + h (`toBeCloseTo(2 + h, 9)`) for h in {1, 0.1,
0.001}; `effectiveH(2.5, 1)` = 0.5 and `effectiveH(3, 1)` = null; the table's scale/start/singular
values; band properties on a 601-sample grid: max |s·f| ≤ 3 + 1e-9 for every function, and
max |s′·f′| ≤ 2.5 + 1e-9 for every function except `sqrtabs` (where the scene clamps).

## 5. State (`viz/derivative/state.ts`, pure, unit-tested)

```ts
interface DxState {
  readonly fn: FnKey; readonly x: number; readonly h: number; readonly zoom: 0 | 1 | 2 | 3;
  readonly show: { tangent: boolean; secant: boolean; derivative: boolean };
}
```
`initialState()`: `square`, x = start, h = 1, zoom 0, all shown. Reducers: `setFn(s, key)` (x →
that function's start, h unchanged, zoom → 0), `setX(s, x)` (clamp to [−3, 3], then snap
to `singularAt` within 0.02; no-op when zoom > 0), `setH(s, h)` (clamp [1e-3, 2]), `zoomIn(s)`
(zoom + 1, max 3), `resetZoom(s)`, `setShow`, `reset(s)` (x → start, h → 1, zoom 0, show
unchanged). `derived(s)`: `fx`, `d: Derivative`, `hEff: number | null`, `secant: number | null`,
`gap: number | null` (secant − f′ when both numeric), `K = 4^zoom`, `window: [x − 3/K, x + 3/K]`
(the full domain at zoom 0), `secantInWindow: boolean`.

## 6. Controls (side panel, in order)

1. Function select (table order).
2. h slider (log, 1e-3 … 2, default 1, readout `h = <fmt>`; when `hEff` is a number and differs
   from h append ` (clipped to <fmt>)`; when `hEff` is null the readout reads `h = <fmt> (x is at
   the right edge; no secant)`).
3. Buttons: Zoom in (disabled at zoom 3), Reset zoom (disabled at zoom 0), Reset, Reset view.
4. Toggles: Tangent, Secant, Derivative curve.

Readouts: x; f(x); f′(x) (number; "undefined: left −1, right 1" for a jump; "∞ (vertical
tangent)" for vertical); secant slope (or "—"); secant − f′ (or "—"); Window (`[a, b]`, shown
only when zoomed). Note under the buttons when zoomed: "Reset zoom to move the point".

Explanation. KaTeX carries only structure and is set through `createEquation` (which no-ops on an
unchanged string), so it re-renders only when the function changes; every live number is a
plain-text span updated on each render.

- Tangent: `f'(x) = \lim_{h \to 0} \frac{f(x+h) - f(x)}{h}` and the function's `tex`; text: "At x =
  <x>, f′(x) = <f′>, the slope of the blue line."
- Secant: text only (numbers): "With h = <hEff>, the secant slope is <secant>, off by <gap>. Shrink
  h and the grey line rotates onto the blue one." For `abs` at 0: "Right-hand secants all have
  slope 1 while the curve to the left has slope −1, so no single line fits: |x| has no derivative at
  0." For `sqrtabs` at 0: "The secant slopes grow without bound as h shrinks, so the tangent is
  vertical and f′(0) is undefined."
- The lower curve: `f'(x) = <texPrime>`; text: "The height of the lower marker is the slope of the
  upper tangent." plus the function's `hint`. When zoomed, an extra sentence: "Zoomed ×<K>: the
  curve is nearly its tangent, which is what differentiable means."

## 7. Interaction details

- Drag the main point: shared drag with `plane: { normal: (0, 1, 0), getOffset: () => 0 }`. The hit
  arrives as `[x, 0]` (the drag module reports the world x and y components; only `pos[0]` is used,
  `clamp` passes the second through). `onDrag` → `setX`. Click anywhere on the invisible plane
  (`surfaceTarget`) places the point at that x (index −1, same handler). Orbit elsewhere; grab
  cursor over the point. `enabled: () => state.zoom === 0`.
- Zoom in / Reset zoom re-sample the curve; nothing animates, so there is no reduced-motion branch
  beyond the shared camera damping. The loop is poked by the shell on `click`, and `apply` sets
  `dirty`, so one frame renders.
- Hint (shared): "Drag the black point along the curve, or click the plane to move it."; "Shrink h
  to watch the secant become the tangent."; "Zoom in to see the curve straighten into its
  tangent."; key `ai-lab.hint.derivative`.
- Reset view restores the home framing (instant, as in the other scenes).

## 8. Files and shared changes

```
src/core/math/functions1d.ts                         + tests/core/math/functions1d.test.ts
src/viz/shared/drag.ts   make the drag-plane source a union so the compiler enforces exactly one:
                         `{ getPlaneZ(index): number }` (existing, normal +Z) or
                         `{ plane: { normal: Vector3; getOffset(index): number } }`, which sets
                         `dragPlane.set(normal, -getOffset(index))`; `onDrag`/click-to-place keep
                         reporting `[hit.x, hit.y]`. Tests: a vertical-plane drag reports the world x
                         of the hit; existing tests unchanged.
src/viz/derivative/
  index.ts          Visualization (mount/apply/update/resize/dispose mirroring matrix-transformation:
                    buildScene with unwind, panel declared before apply, theme "change" → dirty,
                    dispose order hint → panel → scene objects → disposeObject → kit, hit plane disposed)
  state.ts          reducers above                              + tests
  frame-vertical.ts five-line local framing helper
  curves.ts         axes, separator, main curve, derivative curve (runs split at singularAt), guides
  lines.ts          tangent and secant segments (clipSegment against the display box)
  points.ts         three spheres, hit sphere, invisible click plane
  panel.ts, explanation.ts                                       + panel tests
src/app/registry.ts, parent spec §9 item 5, README (roadmap + screenshot)
```

## 9. Verification

Vitest: functions1d (§4); state (each reducer, clamps, snapping at 0.019 vs 0.021, zoom bounds,
setX no-op while zoomed, hEff/secant/gap/window/secantInWindow); drag plane option; panel
(readouts for `square` at 1.5: f 2.25, f′ 3, secant 4 at h 1, gap 1; `abs` at 0 jump text; `sqrtabs`
at 0 vertical text; h clipping text at x 2.5, h 1; Zoom in disables at 3 and shows the Window
readout and the note; Reset zoom hides them).

Chrome (screenshots in `docs/screenshots/`): drag along `sine`, tangent follows and the lower
marker rides on cos x; on `square` at x = 1.5 slide h from 1 to 0.001 and watch secant − f′ go
from 1 to 0.001; drag to x ≈ 0 on `abs` snaps to 0, hides the tangent and shows the jump text;
`sqrtabs` at 0 draws a vertical tangent; Zoom in three times on `square` makes the curve and
tangent coincide and disables dragging; Reset zoom restores; theme toggle; leaving logs no leak.
