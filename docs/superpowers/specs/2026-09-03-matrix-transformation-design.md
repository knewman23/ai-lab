# Matrix transformation — a 2×2 matrix acting on the plane, drawn in 3D

Date: 2026-09-03
Status: approved by owner in conversation; spec under review
Parent: [AI Lab design](2026-09-03-ai-lab-design.md) (shell, theme, interface, conventions all apply)
Registry: replaces the `linear-algebra` roadmap entry `matrix-transformation`

## 1. Purpose

Students see a matrix as a table of numbers. This scene shows it as a motion of the plane: drag the
tips of the two basis vectors and the whole plane, a unit square and a lattice of points, deforms
live. The determinant appears as signed area, eigenvectors as the two directions the matrix only
stretches. An animate slider scrubs from the identity to the matrix so the deformation can be
watched rather than inferred.

Success criteria:

- Two clicks from the home page. 60 fps while dragging on a 2020 laptop.
- Every number shown matches an independent calculation (det, trace, eigenvalues, area).
- A student can produce a reflection, a shear, a rotation and a projection by dragging alone, and
  the readout names what happened to orientation and area.

Out of scope: 3×3 matrices, change of basis, matrix composition, complex eigenvector display.

## 2. Decisions

| Question | Decision | Alternatives considered |
|---|---|---|
| Dimension | 2×2 on a plane, viewed by the 3D camera | 3×3 on a cube (hard to drag, eigenvectors often complex); both with a toggle |
| Matrix editing | Drag basis-vector tips, plus four number inputs kept in sync | Inputs only; drag only |
| Deformation animation | Entry-wise interpolation M(t) = (1 − t)I + tM, t ∈ [0, 1] | Polar-decomposition interpolation (nicer for rotations, harder to explain) |
| Orientation cue | Filled square coloured by sign of det: `--accent` positive, `--warn` negative | Arrow marker for orientation; text only |
| Eigenvectors | Drawn only when real; text explains the complex and "all directions" cases | Always draw something |

## 3. Scene

All geometry lies on the plane z = 0 in the shared Z-up scene; the camera starts tilted
(`frameFor`-style framing over the domain [−3, 3]², height 0) and orbits as in the gradient scene.

- **Reference grid**: unit-spaced lines over [−3, 3]², colour `--line`, drawn once, never
  transformed. It is the "before".
- **Transformed lattice**: the same grid lines, each vertex mapped by M(t), colour `--soft`.
  Lines are drawn as polylines of 25 sample points each so they stay straight but clip cleanly at
  a display bound of [−6, 6]² (vertices outside are clamped to that box).
- **Unit square**: filled quad with corners (0,0),(1,0),(1,1),(0,1) mapped by M(t); opacity .35;
  colour `--accent` when det M(t) > 0, `--warn` when < 0, `--faint` when |det| < 1e-6. The
  untransformed square remains as a thin `--faint` outline ("ghost").
- **Point lattice**: an `InstancedMesh` of 13 × 13 small spheres at integer-and-half spacing over
  [−3, 3]², mapped by M(t), colour lerped from `--faint` (origin) to `--ink` (edge) by original
  distance from the origin so students can track where points came from. Toggleable.
- **Basis vectors**: two `ArrowHelper`s from the origin to M(t)·e₁ (colour `--accent`) and
  M(t)·e₂ (colour `--ink`), lengths set exactly to the vectors (no clamping). At each tip a
  draggable ball (radius 0.08, invisible hit sphere radius 0.2), colour matching the arrow. Only
  the tips at t = 1 are draggable; at t < 1 the balls are hidden and dragging is disabled (the
  panel says "set Animate to 1 to drag"). Labels "î" and "ĵ" as small sprites are out of scope;
  the panel legend names the colours.
- **Eigen lines**: for each real eigenvector, a line through the origin in that direction spanning
  the display bound, colour `--line-2`, plus a small `--ink` sphere at the unit eigenvector scaled
  by its eigenvalue (so the sphere sits where M sends the unit eigenvector). Toggleable. Hidden
  when eigenvalues are complex or when M is a multiple of the identity.

Colours come from `ThemeColors`; this scene needs `--warn` and `--line-2`, so `ThemeColors` gains
`warn` and `line2` fields (both hex in every theme block of `tokens.css`) and `core/theme.ts`
reads them. This widens the shared interface additively; the gradient scene is unaffected.

## 4. Math (`core/math/matrix2.ts`, pure, unit-tested)

`Mat2 = readonly [a, b, c, d]` meaning [[a, b], [c, d]], columns (a, c) = M·e₁ and (b, d) = M·e₂.

- `apply(m, [x, y])` → `[a·x + b·y, c·x + d·y]`.
- `det(m)` = ad − bc; `trace(m)` = a + d.
- `lerpIdentity(m, t)` = `[1 + t(a − 1), t·b, t·c, 1 + t(d − 1)]`.
- `eigen(m)`: disc = tr² − 4·det. Returns one of
  - `{ kind: "complex" }` when disc < −1e-9;
  - `{ kind: "uniform", value: a }` when |b| < 1e-9, |c| < 1e-9 and |a − d| < 1e-9 (every
    direction is an eigenvector);
  - `{ kind: "real", pairs: [{ value, vector }, …] }` otherwise, with 1 pair when disc < 1e-9
    (repeated root, defective unless uniform) and 2 pairs when disc > 0. Eigenvalues
    λ = (tr ± √max(disc, 0))/2. Eigenvector for λ: `(b, λ − a)` if |b| > 1e-9, else
    `(λ − d, c)` if |c| > 1e-9, else `e₁` for λ = a and `e₂` for λ = d. Vectors are normalised and
    oriented so the larger-magnitude component is positive (deterministic).
- `fromColumns(v1, v2)` and `columns(m)` for the drag ↔ matrix mapping.

Tests: hand-computed cases: identity (uniform 1), scale [[2,0],[0,.5]] (2 with e₁, .5 with e₂),
shear [[1,1],[0,1]] (single repeated 1 with e₁), rotation 45° (complex), reflection [[1,0],[0,−1]]
(1 with e₁, −1 with e₂), symmetric [[2,1],[1,2]] (3 with (1,1)/√2, 1 with (1,−1)/√2 up to sign),
projection [[1,0],[0,0]] (1 and 0, det 0); `apply` on the four unit-square corners for a shear;
`lerpIdentity` at t = 0 and t = 1; eigen results satisfy M·v = λ·v within 1e-9 for 50 seeded
random matrices with disc > 1e-6.

## 5. State (`viz/matrix-transformation/state.ts`, pure, unit-tested)

```ts
interface MtState {
  readonly m: Mat2;                 // the matrix being edited (t = 1)
  readonly t: number;               // animate parameter, 0..1, default 1
  readonly preset: PresetKey | "custom";
  readonly show: { lattice: boolean; points: boolean; eigen: boolean; ghost: boolean };
}
```

Reducers: `initialState()` (identity, t 1, preset "identity", all show true), `setEntry(s, i, v)`
(i ∈ 0..3, v clamped to [−3, 3], preset → "custom"), `setPreset(s, key)` (loads the preset and
sets t to 1), `dragBasis(s, which: 0 | 1, point)` (point clamped to [−3, 3]²; column replaced;
preset → "custom"), `setT(s, t)` (clamped 0..1), `setShow(s, key, on)`, `reset(s)` (identity,
t 1, show unchanged). `derived(s)`: `mt = lerpIdentity(m, t)`, `det`, `trace`, `eigen(m)`
(eigenvectors are of M, not M(t); the lines are drawn for M and the readout says so), `area =
|det(mt)|`, `orientation: "preserved" | "reversed" | "collapsed"` (det > 1e-6, < −1e-6, else).

Presets (values exact):

| Key | Title | Matrix |
|---|---|---|
| `identity` | Identity | [[1, 0], [0, 1]] |
| `scale` | Scale | [[2, 0], [0, 0.5]] |
| `shear` | Shear | [[1, 1], [0, 1]] |
| `rotation` | Rotation 45° | [[√½, −√½], [√½, √½]] |
| `reflection` | Reflection across x | [[1, 0], [0, −1]] |
| `projection` | Projection onto x | [[1, 0], [0, 0]] |
| `spiral` | Rotate and scale | [[1, −1], [1, 1]] |

## 6. Controls (side panel, in order)

1. Preset select (the table above; shows "Custom" once edited).
2. Matrix entries: a 2×2 block of `<input type="number" step="0.1" min="-3" max="3">` laid out as
   a matrix (a b / c d), mono font. Typing updates the vectors live; dragging updates the inputs.
3. Animate slider, linear 0..1, default 1, with the readout "t = 0.00".
4. Buttons: Reset, Reset view.
5. Toggles: Transformed lattice, Points, Eigenvectors, Ghost square.

Readouts (mono, tabular): det M(t), trace M, eigenvalues (two numbers, "complex pair" or "all
directions"), area of the square, orientation.

Explanation (three paragraphs, KaTeX structure re-rendered only when the matrix changes):

- The columns of M are where î and ĵ land: `M = \begin{pmatrix} a & b \\ c & d \end{pmatrix}`
  with live numbers.
- The determinant is the area scale factor; its sign is orientation. `\det M = ad - bc` with
  live numbers, and a sentence naming the current case (preserved / reversed / collapsed to a
  line).
- Eigenvectors are the directions M only stretches: `M\mathbf v = \lambda \mathbf v`; a sentence
  for the current kind (two lines, one line for a shear, none for a rotation, every direction
  for a uniform scale).

## 7. Interaction details

- Pointer events, mouse and touch. Drag on a basis ball moves that column; the drag plane is
  z = 0; positions clamp to [−3, 3]². Orbit is disabled during a drag; drag elsewhere orbits.
  Hover over a ball shows a grab cursor. No click-to-place.
- The on-canvas usage hint from the gradient scene is reused with this scene's text ("Drag the
  tips of the two arrows…"); the `localStorage` key is `ai-lab.hint.matrix-transformation`.
- Changing t below 1 hides the balls and disables dragging; the panel shows "Set Animate to 1 to
  drag the vectors".
- `prefers-reduced-motion`: camera damping off (as in the shared scene kit); nothing else animates
  on its own.
- Reset view restores the initial framing.

## 8. Files

```
src/core/math/matrix2.ts                      + tests/core/math/matrix2.test.ts
src/core/theme.ts, src/viz/types.ts           add warn and line2 (additive)
src/viz/matrix-transformation/
  index.ts        Visualization: mount, apply, update, resize, dispose (mirrors gradient-descent)
  state.ts        reducers above                              + tests
  presets.ts      the preset table                            (tested via state tests)
  plane.ts        reference grid, transformed lattice, unit square + ghost
  points.ts       InstancedMesh lattice
  basis.ts        two arrows + drag balls (hit targets), setMatrix(mt)
  eigen-lines.ts  eigen lines and spheres
  panel.ts        controls + readouts                          + light jsdom tests
  explanation.ts  three paragraphs
src/ui/matrix-input.ts   the 2×2 number-input block            + test
src/app/registry.ts      replace the roadmap entry
```

Shared pieces reused as-is: `createSceneKit`, `disposeObject`, `frameFor` (generalised to accept a
domain and height range rather than a `Surface`, a small refactor with its test updated),
`attachDrag` (generalised: `hitTargets: Object3D[]` with the hit index passed to `onDrag`, the
drag plane height as an option, click-to-place made optional), `createUsageHint` (text passed
in), all widgets, `createEquation`, `fmt`.

## 9. Tests and verification

Vitest: `matrix2` (above), `state` (each reducer, clamping, preset → custom, derived cases),
`matrix-input` (typing dispatches, programmatic set does not), `panel` (renders readouts for the
identity and for the reflection preset; eigen text for the rotation preset says complex).

Chrome (manual, screenshots in `docs/screenshots/`): shear preset shows a parallelogram and one
eigen line; reflection flips the square colour to `--warn` and shows det −1; rotation shows no
eigen lines and the "complex" readout; dragging î to (2, 0) shows det 2 and area 2; Animate at
0.5 shows the half-way shape; theme toggle repaints; leaving the scene logs no leak warning.
