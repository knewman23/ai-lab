# Derivative and tangent explorer — a 1D function, its tangent, the secant limit and f′

Date: 2026-09-03
Status: owner delegated the design; spec under review
Parent: [AI Lab design](2026-09-03-ai-lab-design.md); sibling: [Matrix transformation](2026-09-03-matrix-transformation-design.md)
Registry: replaces the `calculus` roadmap entry `derivative-tangent`

## 1. Purpose

Make the derivative visible three ways at once: as the slope of the tangent at a draggable point,
as the limit of secant slopes as h shrinks, and as the height of a second curve f′(x) drawn
underneath that tracks the same x. A "zoom to point" camera move shows the curve straightening into
its tangent, which is what differentiability means. Two functions are deliberately not
differentiable somewhere so the failure modes are shown, not just described.

Success criteria: two clicks from the home page; 60 fps while dragging; every readout matches an
independent calculation; secant slope visibly converges to f′ as h → 0; at x = 0 on |x| the panel
says why there is no tangent.

Out of scope: user-typed functions, higher derivatives, integrals, parametric curves.

## 2. Decisions

| Question | Decision | Alternatives |
|---|---|---|
| Layout | Curve on the vertical plane y = 0 (x → world x, f → world z); f′ curve on the same plane below it | Two planes at different depths (harder to read); 2D canvas (loses the shared shell) |
| Secant control | Log slider for h, 1e-3 … 2, default 1 | Animated h → 0 button (roadmap: add later if wanted) |
| Non-differentiable points | Explicit classification: value, jump (|x| at 0), vertical (√|x| at 0) | Silently show a numeric derivative |
| Zoom | "Zoom to point" moves the camera to the point over 0.6 s (instant under reduced motion); "Reset view" restores | Scroll only |
| Dragging | Reuse the shared drag with a vertical drag plane (new option) | Bespoke pointer code |

## 3. Scene

Shared Z-up scene; everything lies on the plane y = 0. Display space: the main curve is
z = s·f(x) with a per-function scale s so the curve fits z ∈ [−3, 3]; the derivative curve is
z = z₀ + s′·f′(x) with z₀ = −6 and its own scale s′ so it fits z ∈ [−8.5, −3.5]. Domain x ∈ [−3, 3]
for every function. Framing: the shared `frameFor` over x ∈ [−3, 3], "y" ∈ [−8.5, 3] (the helper is
axis-agnostic: pass the two spans; see §8), viewed from the +y side so the plane faces the camera.

Flat layers (`transparent: true`, `depthTest: false`, `depthWrite: false`, explicit `renderOrder`,
as in the matrix scene):

| Order | Layer | Colour | Notes |
|---|---|---|---|
| 1 | Axes and ticks | `--line` | x axis (z = 0) and z axis for the main curve; x axis at z₀ for the derivative curve; unit ticks; a faint `--faint` horizontal at z = −3.5 separating the two |
| 2 | Derivative curve | `--soft` | 241 samples over [−3, 3]; drawn as a `Line`; toggleable; breaks (gaps) where f′ is undefined (|x|: none, it jumps; √|x|: skip the sample at 0) |
| 3 | Main curve | `--ink` | 241 samples, `Line`, width via colour only |
| 4 | Secant line | `--soft`, opacity .8 | through (x, s·f(x)) and (x+h, s·f(x+h)), extended to the display bound [−3.5, 3.5] in x and clipped to z ∈ [−3.5, 3.5] with `clipSegment`; toggleable |
| 5 | Tangent line | `--accent` | through (x, s·f(x)) with display slope s·f′(x), extended and clipped like the secant; hidden for a jump; vertical (x = const) for a vertical tangent |
| 6 | Guides | `--faint`, opacity .6 | a dashed-looking (two-segment) vertical from the point down to the derivative curve, and a small horizontal tick at the derivative curve's height, so the eye links slope above to height below |
| 10 | Points | 3D, depth on, `transparent: true` | main point: sphere r 0.08 `--ink` (draggable, hit sphere r 0.2); secant point at x+h: sphere r 0.06 `--soft`; derivative marker: sphere r 0.06 `--accent` at (x, z₀ + s′·f′(x)), hidden when f′ is undefined |

Colours from `ThemeColors`; no new tokens needed.

## 4. Math (`core/math/functions1d.ts`, pure, unit-tested)

```ts
type Derivative = { kind: "value"; v: number } | { kind: "jump"; left: number; right: number } | { kind: "vertical" };
interface Fn1D { key; title; tex: string /* KaTeX for f */; texPrime: string /* KaTeX for f′ */;
  f(x): number; d(x): Derivative; scale: number; primeScale: number; start: number; hint: string; }
```

| Key | f | f′ | s | s′ | start | Why |
|---|---|---|---|---|---|---|
| `square` | x² | 2x | 1/3 | 1/2.4 | 1.5 | the first derivative everyone meets |
| `cubic` | x³ − 3x | 3x² − 3 | 1/6 | 1/9.6 | 0.8 | turning points where f′ = 0; inflection at 0 |
| `sine` | sin x | cos x | 2 | 2 | 1 | f′ is another familiar curve |
| `exp` | eˣ⁄4 | eˣ⁄4 | 0.6 | 0.6 | 1 | f′ = f |
| `abs` | \|x\| | sign(x); jump at 0 | 1 | 2 | 1.2 | no tangent at the corner |
| `sqrtabs` | √\|x\| | sign(x)/(2√\|x\|); vertical at 0 | 1.5 | 1/2.4 clamped | 1 | vertical tangent, f′ → ±∞ |

`d(x)` returns `jump` for `abs` when |x| < 1e-9 (left −1, right 1) and `vertical` for `sqrtabs` when
|x| < 1e-9; otherwise `value`. `s′` is chosen so |s′·f′| ≤ 2.5 over the domain except near the
`sqrtabs` singularity, where the derivative curve is clamped to the band [−8.5, −3.5] (clamp the
display z, note it in a comment). `secantSlope(fn, x, h)` = (f(x+h) − f(x))/h; when x + h leaves the
domain, h is reduced so x + h = 3 (the panel shows the effective h).

Tests: every `value` derivative matches central differences at 25 seeded points (rel 1e-4) away
from the singularities (|x| > 0.05); `abs.d(0)` is `jump {−1, 1}`; `sqrtabs.d(0)` is `vertical`;
`secantSlope(square, 1, h)` equals 2 + h exactly for h in {1, 0.1, 0.001}; the table's scale/start
values; the display band property: max |s·f| ≤ 3 and, for all but `sqrtabs`, max |s′·f′| ≤ 2.5 on
a 601-sample grid.

## 5. State (`viz/derivative/state.ts`, pure, unit-tested)

```ts
interface DxState { readonly fn: FnKey; readonly x: number; readonly h: number;
  readonly show: { secant: boolean; tangent: boolean; derivative: boolean; guides: boolean }; }
```
`initialState()`: `square`, x = start, h = 1, all shown. Reducers: `setFn(s, key)` (x → that
function's start, h unchanged), `setX(s, x)` (clamped to [−3, 3]), `setH(s, h)` (clamped to
[1e-3, 2]), `setShow`, `reset(s)` (x → start, h → 1, show unchanged). `derived(s)`: `fx`, `d:
Derivative`, `hEff` (h reduced so x + hEff ≤ 3), `secant` (slope or `null` when hEff < 1e-9),
`gap` (secant − f′ when both are numbers, else `null`).

## 6. Controls (side panel, in order)

1. Function select (table order).
2. h slider (log, 1e-3 … 2, default 1, readout `h = <fmt>` and, when reduced, `(clipped to <fmt>)`).
3. Buttons: Zoom to point, Reset view, Reset.
4. Toggles: Tangent, Secant, Derivative curve, Guides.

Readouts: x; f(x); f′(x) (a number, "undefined (left −1, right 1)" for a jump, "∞ (vertical
tangent)" for vertical); secant slope; secant − f′ (or "—").

Explanation (three paragraphs, KaTeX re-rendered only when the function changes):

- Tangent: `f'(x) = \lim_{h \to 0} \frac{f(x+h) - f(x)}{h}` with the current function's `tex`,
  then the current numbers: f′(x) and the slope of the drawn tangent.
- Secant: the same quotient with the live h substituted and its value; one sentence: shrink h and
  watch the grey line rotate onto the blue one; for `abs` at 0: "from the left the secants tilt to
  −1, from the right to +1, so no single line fits"; for `sqrtabs` at 0: "the secant slopes grow
  without bound, so the tangent is vertical".
- The lower curve: `f'(x) = <texPrime>`; "the height of the lower marker is the slope of the
  upper tangent". Function `hint` sentence.

## 7. Interaction details

- Drag the main point along the curve: the shared drag with a vertical drag plane (normal +y,
  offset 0); the hit gives (x, z); only x is used, clamped to [−3, 3]; z is recomputed as s·f(x).
  Click anywhere on the plane (an invisible `PlaneGeometry(7, 12)` mesh at y = 0 as
  `surfaceTarget`) places the point at that x. Orbit elsewhere; grab cursor over the point.
- Zoom to point: animate camera position from its current pose to `point + (0, −1.6, 0.5)` and
  the controls target to the point over 0.6 s with an ease-out cubic, driven inside `update`
  (returns true while animating); instant under `prefers-reduced-motion`. Orbit stays enabled.
  Reset view restores the home framing (also animated).
- Hint (shared): "Drag the black point along the curve, or click the plane to move it.";
  "Shrink h to watch the secant become the tangent."; "Zoom to point to see the curve straighten
  into its tangent."; key `ai-lab.hint.derivative`.

## 8. Files and shared changes

```
src/core/math/functions1d.ts                         + tests
src/viz/shared/drag.ts        add optional `plane?: { normal: Vector3; getOffset(index): number }`
                              (default normal +Z with the existing getPlaneZ); tests
src/viz/shared/framing.ts     already domain-based; the derivative scene maps its z span to the
                              helper's y span and rotates the result about x so the camera sits on
                              the +y side (a tiny `frameVertical` wrapper in the viz folder)
src/viz/shared/camera-tween.ts  createCameraTween(camera, controls): { to(position, target, ms), advance(dt): boolean, cancel() }  + tests (pure easing)
src/viz/derivative/
  index.ts  state.ts  curves.ts (axes, main + derivative curves, guides)  lines.ts (tangent, secant)
  points.ts (three spheres + hit target)  panel.ts  explanation.ts  frame-vertical.ts
src/app/registry.ts, parent spec §9 item 5, README (roadmap + screenshot)
```

## 9. Verification

Vitest: functions1d (§4), state (reducers, clamps, hEff), camera-tween (easing endpoints, done
flag, cancel), panel (readouts for `square` at 1.5: f 2.25, f′ 3, secant 4 at h 1; `abs` at 0
readout text; `sqrtabs` at 0 readout text; h readout shows clipping when x = 2.5, h = 1).

Chrome: drag the point along `sine`, tangent follows and the lower marker rides on cos x; slide h
from 1 to 0.001 on `square` at x = 1.5 and watch secant − f′ go from 1 to 0.001; `abs` at 0 hides
the tangent and shows the jump text; `sqrtabs` at 0 draws a vertical tangent; Zoom to point shows
the curve as a straight line, Reset view returns; theme toggle; no leak warning; screenshots.
