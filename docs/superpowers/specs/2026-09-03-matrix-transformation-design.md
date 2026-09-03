# Matrix transformation — a 2×2 matrix acting on the plane, drawn in 3D

Date: 2026-09-03
Status: approved by owner in conversation; spec under review
Parent: [AI Lab design](2026-09-03-ai-lab-design.md) (shell, theme, interface, conventions all apply)
Registry: replaces the `linear-algebra` roadmap entry `matrix-transformation`; its card summary and
the parent spec's §9 roadmap line are reworded from "unit cube" to the plane described here.

## 1. Purpose

Students see a matrix as a table of numbers. This scene shows it as a motion of the plane: drag the
tips of the two basis vectors and the plane's grid and unit square deform live. The determinant
appears as signed area, eigenvectors as the directions the matrix only stretches. An animate slider
scrubs from the identity to the matrix so the deformation can be watched rather than inferred.

Success criteria:

- Two clicks from the home page. 60 fps while dragging on a 2020 laptop.
- Every number shown matches an independent calculation (det, trace, eigenvalues, area).
- A student can produce a reflection, a shear, a rotation and a projection by dragging alone, and
  the readout names what happened to orientation and area.

Out of scope: 3×3 matrices, change of basis, composition, complex eigenvector display, a point
lattice (the transformed grid already shows where points go).

## 2. Decisions

| Question | Decision | Alternatives considered |
|---|---|---|
| Dimension | 2×2 on a plane, viewed by the 3D camera | 3×3 on a cube (hard to drag, eigenvectors often complex); both with a toggle |
| Matrix editing | Drag basis-vector tips, plus four number inputs kept in sync | Inputs only; drag only |
| Deformation animation | Entry-wise interpolation M(t) = (1 − t)I + tM, t ∈ [0, 1] | Polar-decomposition interpolation (nicer for rotations, harder to explain) |
| Orientation cue | Filled square coloured by sign of det: `--accent` positive, `--warn` negative | Arrow marker for orientation; text only |
| Eigenvectors | Drawn only when real; text explains the complex and "all directions" cases | Always draw something |
| Coplanar layers | Flat layers use `depthTest: false` with explicit `renderOrder`; no z offsets | Small z offsets per layer (still fights at grazing angles) |

## 3. Scene

All geometry lies on the plane z = 0 in the shared Z-up scene. The camera is framed over the
display bound D = [−5, 5]² at height 0 (using the shared framing helper) and orbits as in the
gradient scene. Because every flat layer is coplanar, each flat material has `depthTest: false`,
`depthWrite: false`, `transparent: true` (even at opacity 1, so all layers sit in three's single
transparent sort group and `renderOrder` alone decides the order), and a fixed `renderOrder` in
this stacking order (low draws first):

| Order | Layer | Colour | Notes |
|---|---|---|---|
| 1 | Reference grid | `--line` | unit-spaced lines over [−3, 3]², never transformed: the "before" |
| 2 | Transformed grid | `--soft` | same lines mapped by M(t), each clipped to D (below) |
| 3 | Eigen lines | `--line-2` | through the origin, spanning D |
| 4 | Ghost square | `--faint` | outline of the untransformed unit square |
| 5 | Unit square fill | see below | quad with corners (0,0),(1,0),(1,1),(0,1) mapped by M(t), opacity .35 |
| 6 | Basis arrows, balls, eigen spheres | see below | 3D objects, depth testing on, `transparent: true` so they sort after the fill, `renderOrder` 10 |

- **Transformed grid clipping**: a linear map sends lines to lines, so each grid line is one
  segment: map its two endpoints by M(t), then clip the segment against D with `clipSegment` and
  drop it if fully outside. The grid has 7 vertical + 7 horizontal = 14 lines, so one
  `LineSegments` with a preallocated buffer of 14 · 2 endpoints · 3 = 84 floats; surviving
  segments are compacted to the front and the draw range set to their count. Eigen lines reuse
  `clipSegment` on a long segment through the origin.
- **Unit square fill colour**: when |det M(t)| < 1e-6 the square has collapsed to a segment (or a
  point): draw the fill as a thick-looking `--warn` segment instead: a quad of width 0.04 whose
  long axis runs from the minimum to the maximum of the four mapped corners {0, c₁, c₁ + c₂, c₂}
  along the collapsed direction (they are collinear in this case); if the whole matrix is zero
  draw nothing and let the readout speak. Otherwise `--accent` when det M(t) > 0, `--warn` when det M(t) < 0.
- **Basis vectors**: two `ArrowHelper`s from the origin to M(t)·e₁ (colour `--accent`) and
  M(t)·e₂ (colour `--ink`), lengths equal to the vectors, head size 0.18 of the length clamped to
  [0.08, 0.3]. When a column's length is below 1e-6 the arrow is hidden (`ArrowHelper` cannot
  represent a zero vector) and only the tip ball is drawn, at the origin. Each tip carries a
  draggable ball (radius 0.08, invisible hit sphere radius 0.2) in the arrow's colour. Balls are
  shown and draggable only at t = 1; at t < 1 they are hidden by setting their materials
  invisible AND dragging is gated by the drag handler's `enabled` predicate (raycasting ignores
  `Object3D.visible`, so hiding alone would leave them hittable). The panel shows "Set Animate to
  1 to drag the vectors". The panel legend names the colours (î accent, ĵ ink); no 3D labels.
- **Eigen lines**: M(t) = (1 − t)I + tM has the same eigenvectors as M for every t > 0, with
  eigenvalues λ(t) = 1 − t + tλ, so the lines are drawn for M and remain correct as t moves. For
  each real eigen pair: a line through the origin along the unit eigenvector v, spanning D, and a
  small `--ink` sphere (radius 0.06) at λ(t)·v, which is where M(t) sends the unit eigenvector.
  The sphere is hidden when |λ(t)| < 1e-6 (the readout says "sent to the origin"). Lines and
  spheres are hidden when the eigen kind is `complex` or `uniform`. Toggleable.

Colours come from `ThemeColors`; this scene needs `--warn` and `--line-2`, so `ThemeColors` gains
`warn` and `line2` (6-digit hex in every theme block of `tokens.css`; the neighbouring `--warn-bg`
and `--warn-line` are `rgba()` in dark and must not be used). `core/theme.ts` adds the two tokens
to `TOKENS` and the two `Color` fields to its implementation. Additive; the gradient scene is
unaffected.

## 4. Math (`core/math/matrix2.ts`, pure, unit-tested)

`Mat2 = readonly [a, b, c, d]` meaning [[a, b], [c, d]], columns (a, c) = M·e₁ and (b, d) = M·e₂.

- `apply(m, [x, y])` → `[a·x + b·y, c·x + d·y]`.
- `det(m)` = ad − bc; `trace(m)` = a + d.
- `lerpIdentity(m, t)` = `[1 + t(a − 1), t·b, t·c, 1 + t(d − 1)]`.
- `fromColumns(v1, v2)` → `[v1x, v2x, v1y, v2y]`; `columns(m)` → `[[a, c], [b, d]]`.
- `eigen(m)` with `EPS = 1e-9`, disc = tr² − 4·det:
  - if disc < −EPS → `{ kind: "complex" }`;
  - else if |b| < EPS and |c| < EPS and |a − d| < EPS → `{ kind: "uniform", value: a }`;
  - else if disc < EPS → `{ kind: "real", pairs: [one pair] }` with λ = tr/2 (repeated,
    defective);
  - else → `{ kind: "real", pairs: [two pairs] }` ordered by descending eigenvalue,
    λ₊ = (tr + √disc)/2 first.
  Eigenvector for λ: `(b, λ − a)` if |b| > EPS; else `(λ − d, c)` if |c| > EPS; else (diagonal)
  e₁ when |λ − a| ≤ |λ − d|, otherwise e₂. Normalise, then orient deterministically: flip so
  that x > 0; if |x| < 1e-12 flip so that y > 0.
- `clipSegment(p, q, bound)` (Liang–Barsky against the square [−bound, bound]²) → the clipped
  `[p', q']` or `null`.

Tests: identity (uniform 1); scale [[2,0],[0,.5]] (pairs [2, e₁], [.5, e₂] in that order); shear
[[1,1],[0,1]] (one pair, λ 1, vector e₁); rotation 45° (complex); reflection [[1,0],[0,−1]]
([1, e₁], [−1, e₂]); symmetric [[2,1],[1,2]] ([3, (1,1)/√2], [1, (1,−1)/√2] after the orientation
rule); projection [[1,0],[0,0]] ([1, e₁], [0, e₂], det 0); `apply` on the four unit-square corners
for the shear; `lerpIdentity` at t = 0 and 1; for 50 seeded random matrices with disc > 1e-3,
each pair satisfies |M·v − λ·v| < 1e-7; `clipSegment` on a segment crossing one edge, one fully
inside, one fully outside, one crossing two edges.

## 5. State (`viz/matrix-transformation/state.ts`, pure, unit-tested)

```ts
interface MtState {
  readonly m: Mat2;                 // the matrix being edited (t = 1)
  readonly t: number;               // animate parameter, 0..1, default 1
  readonly preset: PresetKey | "custom";
  readonly show: { grid: boolean; eigen: boolean; ghost: boolean };
}
```

Reducers: `initialState()` (identity, t 1, preset "identity", all show true); `setEntry(s, i, v)`
(i ∈ 0..3; non-finite `v` leaves the state unchanged; finite `v` is clamped to [−3, 3]; preset →
"custom"); `setPreset(s, key)` (loads the preset, t → 1); `dragBasis(s, which: 0 | 1, point)`
(point clamped to [−3, 3]²; that column replaced; preset → "custom"); `setT(s, t)` (clamped to
[0, 1]); `setShow(s, key, on)`; `reset(s)` (identity, t 1, preset "identity", show unchanged).

`derived(s)` → `{ mt: Mat2; detMt; detM; traceM; eigen: Eigen; area: |detMt|; orientation }` where
`orientation` is `"preserved"` when detMt > 1e-6, `"reversed"` when detMt < −1e-6, else
`"collapsed"`.

Presets (values exact):

| Key | Title | Matrix |
|---|---|---|
| `identity` | Identity | [[1, 0], [0, 1]] |
| `scale` | Scale | [[2, 0], [0, 0.5]] |
| `shear` | Shear | [[1, 1], [0, 1]] |
| `rotation` | Rotation 45° | [[√½, −√½], [√½, √½]] |
| `reflection` | Reflection across x | [[1, 0], [0, −1]] |
| `projection` | Projection onto x | [[1, 0], [0, 0]] |

## 6. Controls (side panel, in order)

1. Preset select (the table above plus a disabled "Custom" option that is selected
   programmatically once edited; `src/ui/select.ts` gains an additive `disabled?: boolean` on its
   option type, and assigning `.value = "custom"` still selects it since only user choice is
   blocked).
2. Matrix entries: a 2×2 block of `<input type="number" step="any" min="-3" max="3">` (`step="any"`
   so preset values like √½ are not flagged invalid; the real clamp lives in `setEntry`) laid out
   as a matrix (a b / c d), mono font, in `viz/matrix-transformation/matrix-input.ts`. Typing
   dispatches on `input`; while the field is non-numeric the state is unchanged and the field
   keeps the user's text until blur, when it is rewritten from state. Programmatic writes (from
   dragging or presets) format with `fmt(v, 3)` from `src/ui/readout.ts` and do not dispatch.
3. Animate slider: a new linear `createSlider({ label, min: 0, max: 1, step: 0.01, value,
   onChange, format })` in `src/ui/slider.ts` alongside the existing log slider; readout
   "t = 1.00".
4. Buttons: Reset, Reset view.
5. Toggles: Transformed grid, Eigenvectors, Ghost square.

Readouts (mono, tabular): det M(t); trace M; eigenvalues (two numbers, one number for a repeated
root, "complex pair", or "all directions"); area of the square; orientation (preserved / reversed
/ collapsed).

Explanation (three paragraphs; KaTeX structure re-rendered only when the matrix changes):

- The columns of M are where î and ĵ land: `M = \begin{pmatrix} a & b \\ c & d \end{pmatrix}`
  with live numbers, and the colour legend (î accent, ĵ ink).
- The determinant is the area scale factor and its sign is orientation: `\det M = ad - bc` with
  live numbers, then one sentence naming the current case, and when t < 1 a clause noting that
  the readout shows det M(t), the partially applied matrix.
- Eigenvectors are the directions M only stretches: `M\mathbf v = \lambda \mathbf v`, then one
  sentence for the current kind (two lines; one line for a shear; none for a rotation; every
  direction for a uniform scale; "ĵ is sent to the origin" for the projection).

## 7. Interaction details

- Pointer events, mouse and touch. Drag on a basis ball moves that column; the drag plane is
  z = 0; positions clamp to [−3, 3]². Orbit is disabled during a drag; drag elsewhere orbits.
  Hover over a ball shows a grab cursor. No click-to-place.
- Setting t below 1 hides the balls and disables dragging (the panel note above). Returning t to 1
  re-enables them.
- The shared on-canvas usage hint is reused with this scene's lines: "Drag the tips of the two
  arrows to change the matrix, or type the entries."; "Drag the background to orbit; scroll to
  zoom; right-drag (or two fingers) to pan."; "Slide Animate below 1 to watch the plane deform
  from the identity." Storage key `ai-lab.hint.matrix-transformation`.
- `prefers-reduced-motion`: camera damping off (shared scene kit); nothing else animates on its
  own.
- Reset view restores the initial framing.

## 8. Files and shared-code changes

```
src/core/math/matrix2.ts                        + tests/core/math/matrix2.test.ts
src/core/theme.ts, src/viz/types.ts             add warn and line2 (additive)
src/ui/slider.ts                                add createSlider (linear)   + test
src/ui/select.ts                                add optional `disabled` on options
src/viz/shared/drag.ts, framing.ts, hint.ts     moved from viz/gradient-descent (tests move too)
src/viz/matrix-transformation/
  index.ts        Visualization: mount, apply, update, resize, dispose (mirrors gradient-descent)
  state.ts        reducers above                                 + tests
  presets.ts      the preset table
  plane.ts        reference grid, transformed grid (clipped), unit square + ghost
  basis.ts        two arrows + drag balls, setMatrix(mt), setDraggable(on)
  eigen-lines.ts  eigen lines and spheres
  matrix-input.ts the 2×2 number-input block                     + test
  panel.ts        controls + readouts                            + light jsdom tests
  explanation.ts  three paragraphs
src/app/registry.ts       replace the roadmap entry; reword the summary
docs/superpowers/specs/2026-09-03-ai-lab-design.md   §9 item 2 reworded
```

Generalisations (each keeps the gradient scene working and its tests passing):

- `frameFor(domain: { x: [lo, hi]; y: [lo, hi] }, heightRange)` takes a domain instead of a
  `Surface`; the gradient caller passes `surface.domain`.
- `attachDrag` drops its `Surface` import. Options become `{ canvas, camera, controls, hitTargets:
  readonly Object3D[], getPlaneZ(index): number, clamp?(pos): Vec2, enabled?(): boolean,
  surfaceTarget?: Object3D, onDrag(index, pos) }`. Ball raycast uses
  `intersectObjects(hitTargets, false)` and reports the hit index; click-to-place runs only when
  `surfaceTarget` is given and calls `onDrag(-1, pos)`; hover uses the same list; when `enabled`
  returns false no drag starts and the cursor stays default. The gradient scene passes one hit
  target, `getPlaneZ: () => s·f(pos)`, `clamp: (p) => clampToDomain(SURFACES[state.surface], p)`,
  and its surface group, and ignores the index.
- `createUsageHint(container, { storageKey, heading?, lines })`; the gradient caller passes its
  key and lines.

## 9. Tests and verification

Vitest: `matrix2` (§4); `state` (each reducer, clamping, non-finite guard, preset → custom, reset
→ identity preset, derived cases for each preset); `slider` (linear mapping, format, programmatic
set doesn't fire); `matrix-input` (typing dispatches `setEntry`, invalid text does not, programmatic
set does not fire); `panel` (readouts for identity; reflection shows det −1 and "reversed";
rotation shows "complex pair"; shear shows one eigenvalue; projection shows "collapsed").

Chrome (manual, screenshots in `docs/screenshots/`): shear preset shows a parallelogram and one
eigen line; reflection flips the square colour to `--warn` and shows det −1; rotation shows no
eigen lines and the "complex" readout; projection collapses the square to a `--warn` segment and
hides the ĵ arrow; dragging î to (2, 0) shows det 2 and area 2; Animate at 0.5 shows the half-way
shape with the balls hidden and the note visible; no z-fighting flicker while orbiting; theme
toggle repaints; leaving the scene logs no leak warning.
