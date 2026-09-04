# GPT transformer — one block at d_model = 2, pipeline on a wall, embeddings you drag on the floor

Date: 2026-09-04
Status: proposed
Parent: [AI Lab design](2026-09-03-ai-lab-design.md); siblings: [Neural network](2026-09-04-neural-network-design.md), [Backprop graph](2026-09-03-backprop-graph-design.md), [Matrix transformation](2026-09-03-matrix-transformation-design.md)
Registry: replaces the `machine-learning` roadmap entry `gpt-transformer`

## 1. Purpose

Show what one transformer block actually computes, at a scale where every number fits on
screen. The model is a real single-block GPT with `d_model = 2`, so a token's vector is a
point on a plane you can see and every weight matrix is 2×2 or smaller.

The floor is embedding space: eight vocabulary words as draggable points. The wall in front
of it is the pipeline: five token columns in sequence order, five stage bands rising —
embed + position, attention, + residual, MLP, logits — with each token's vector drawn as a
short arrow inside its column at each band, so you watch the vector get edited as it climbs.
Attention arcs fan from the selected query column back to the columns it reads, thickness
proportional to weight. Because the unembedding is the embedding matrix transposed (weight
tying, as real GPTs do), the words you drag *are* the output directions: "what comes next"
becomes "which word's point is my final vector most aligned with". Drag `mat` toward where
the last token's vector lands and its probability bar grows.

Success criteria:

1. Two clicks from the home page.
2. Every number on screen is computed from the current embeddings by the forward pass in
   `core/math/transformer.ts`; nothing is hardcoded per stage.
3. At the `tuned` embedding preset with positional encoding on, head 1's attention row for
   the last token has its argmax at the immediately preceding position (asserted in a test;
   see §3.7 for the free parameter this constrains).
4. At the `collapsed` preset every attention weight in the last row is within 0.15 of
   uniform (asserted in a test), so a viewer sees that embeddings carrying no information
   produce attention carrying no information.
5. Dragging a vocabulary point changes the probability bars within one frame; a full
   recompute and redraw stays under 4 ms (DEV warns past it, as the nn scene does).
6. Turning positional encoding off makes the two `the` tokens' query, key and value vectors
   identical (asserted in a test) and visibly collapses their columns' glyphs.

Out of scope: training of any kind; more than one block; layer normalisation (§3.6 explains
why and what the panel says instead); editable `W_Q`, `W_K`, `W_V`, `W_O` or MLP weights;
user-typed prompts; more than eight vocabulary words or five sequence positions; sampling
(the temperature slider reshapes the distribution but never draws from it); KV caching.

## 2. Decisions

| Question              | Decision                                                                                                                                | Alternatives                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Where the numbers come from | Embeddings are draggable points; `W_Q`/`W_K`/`W_V`/`W_O` and the MLP are fixed hand-authored constants; the forward pass is real   | Weights baked from an in-repo trainer; a transformer trained live in the browser                 |
| Scope                 | One block: embed + position → 2 heads → residual → MLP → residual → unembed → softmax                                                   | One attention head in depth; two stacked blocks                                                  |
| `d_model`             | 2, so an embedding is a visible point and every matrix is printable                                                                     | 4 or 8 with vectors as bar stacks                                                                |
| 3D                    | Pipeline on a vertical wall (y = 0); embedding space on the floor (z = 0) in front of it, as in the neural network scene                 | One embedding plane with the residual stream drawn in it; residual streams as vertical spines     |
| Pacing                | Live: every stage always drawn, every drag recomputes everything. A stage-focus selector dims the other bands and expands one stage       | Stepped forward pass like the backprop scene; live with no stage control                         |
| Attention arcs        | One query token at a time (click a column, defaults to the last), its row fanning back to the keys it reads                              | Always the last token; all N² arcs with the selected row highlighted                             |
| Arc thickness         | Ribbons (triangle-strip `BufferGeometry`), half-width from the weight — line width is fixed at 1 in WebGPU/WebGL                        | Opacity only; many parallel polylines                                                            |
| Unembedding           | Tied to the embedding matrix, so the draggable points double as output directions                                                        | A separate fixed unembedding matrix                                                              |
| Positional encoding   | `PE_SCALE · (cos p, sin p)`, added; toggleable                                                                                          | Learned position embeddings; none                                                                |
| Layer norm            | Omitted; the explanation panel says why and what it would do                                                                             | Included and drawn as a projection onto a circle                                                 |
| Randomness            | None. The scene is a pure function of its state; no PRNG                                                                                | Seeded sampling from the final distribution                                                      |

## 3. Math (`core/math/transformer.ts`; pure, no Three.js, unit-tested)

All vectors are `Float64Array`. The module exports the constants, the forward pass and its
intermediate results; the scene reads only what `forward` returns.

### 3.1 Vocabulary and sequences

Eight words, indices fixed by this order:

```
0 the   1 cat   2 sat   3 on   4 mat   5 dog   6 ran   7 fast
```

Three sequences, each five positions, given as vocabulary indices:

| Key       | Words                | Indices           | Why it is there                                      |
| --------- | -------------------- | ----------------- | ---------------------------------------------------- |
| `cat-sat` | the cat sat on the   | `[0, 1, 2, 3, 0]` | Default. Two copies of `the`, so position matters    |
| `dog-ran` | the dog ran on the   | `[0, 5, 6, 3, 0]` | Same shape, different content: the arcs move         |
| `scrambled` | on the mat sat cat | `[3, 0, 4, 2, 1]` | Same words, wrong order: position changes everything |

### 3.2 Embeddings and their presets

`Embeddings` is a `readonly [number, number][]` of length 8, in vocabulary order. Three
presets, all inside the embedding domain `[-2, 2]²`:

```
tuned:     the (0.0, 1.6)  cat (1.4, 0.8)   sat (-1.4, 0.6)  on (-0.6, -1.4)
           mat (1.2, -1.0) dog (1.6, 0.2)   ran (-1.6, 0.0)  fast (0.4, -1.6)
collapsed: all eight on a circle of radius 0.1 at angles k · 45°
spread:    all eight on a circle of radius 1.8 at angles k · 45°
```

`tuned` groups the parts of speech (determiner up, nouns right, verbs left, modifiers down).
`collapsed` carries almost no information, so attention goes almost uniform and the output
distribution goes almost flat. `spread` is maximally distinguishable but semantically
arbitrary, so attention is sharp and the prediction is confident nonsense — the pair makes
the point that sharpness is not meaning.

### 3.3 Positional encoding

```
pe(p) = PE_SCALE · (cos p, sin p)        PE_SCALE = 0.35
x_p   = embedding[token[p]] + pe(p)      (or just the embedding when the toggle is off)
```

`cos`/`sin` of the position in radians, not the usual multi-frequency sinusoid: at
`d_model = 2` there is room for exactly one frequency. The consequence is deliberate and is
what makes §3.4's head 1 work — rotating a query by one radian points it at the previous
position's key.

### 3.4 Attention: two heads, `d_head = 2`

Per head `h`, with `R(θ)` the 2×2 rotation matrix:

| Head | `W_Q`   | `W_K` | `W_V`   | Intent                                                     |
| ---- | ------- | ----- | ------- | ---------------------------------------------------------- |
| 1    | `R(-1)` | `I`   | `I`     | Leans positional: a query rotated back one radian aligns with the previous position's key |
| 2    | `I`     | `I`   | `0.8 I` | Leans content: the score is the plain dot product of the two tokens' vectors |

```
q_i = W_Q x_i        k_j = W_K x_j        v_j = W_V x_j
s_ij = (q_i · k_j) / sqrt(2)             for j <= i;  -Infinity for j > i
a_i  = softmax(s_i)                      over j = 0..i
o_i^h = sum_j a_ij v_j
```

The softmax is the numerically stable form (subtract the row max before exponentiating), so
a masked row of one entry gives exactly 1.

Both heads' outputs concatenate to four dimensions and `W_O` (2×4) projects back to two:

```
W_O = [ 0.6  0    0.4  0  ]      i.e. 0.6 · o^1 + 0.4 · o^2
      [ 0    0.6  0    0.4 ]
```

**Known limitation, stated in the explanation panel.** At `d_model = 2` the positional and
content information share the same two dimensions, so neither head is pure: head 1's scores
still contain embedding cross-terms and head 2's still contain positional ones. Real models
have enough dimensions to give each an almost-separate subspace. The panel says this; the
scene does not pretend otherwise.

### 3.5 Residual stream and MLP

```
x'_i  = x_i + attnOut_i
h_i   = tanh(W1 x'_i + b1)              W1 is 4x2, b1 is 4
m_i   = W2 h_i + b2                     W2 is 2x4, b2 is 2
x''_i = x'_i + m_i
```

```
W1 = [[ 1.2,  0.3], [-0.4,  1.1], [ 0.9, -1.0], [-1.1, -0.5]]
b1 = [0.1, -0.2, 0.0, 0.15]
W2 = [[0.25, -0.15, 0.30, 0.10], [0.10, 0.35, -0.20, 0.25]]
b2 = [0.0, 0.0]
```

These were chosen so the MLP's contribution is visible but smaller than the attention
output — roughly a third of its length at the `tuned` preset — so the residual chain on the
floor reads as one long arrow then one short one. A test asserts the constants are unchanged,
so a later edit cannot silently redraw every screenshot in `docs/screenshots/`.

### 3.6 No layer norm

At `d_model = 2`, normalising a vector to zero mean and unit variance across two components
leaves only `±(1, -1)/sqrt(2)` — every token would collapse onto one of two points and the
scene would show nothing. It is therefore omitted. The explanation panel says so explicitly,
and says what layer norm does in a real block (rescales each token's vector to a fixed
length before the attention and MLP sublayers, which keeps activations in range as depth
grows) so the omission reads as a documented simplification rather than an error.

### 3.7 Unembedding and the output distribution

Weight-tied: the unembedding matrix is the embedding matrix transposed.

```
logit_v = x''_last · embedding[v]        for v = 0..7
p       = softmax(logit / T)             T is the temperature, default 1
```

So the eight probability bars are eight dot products against the eight draggable points, and
dragging a word toward the last token's final vector raises its bar. This is the scene's
central payoff and the reason weight tying was chosen over a separate matrix.

**The one free parameter.** Success criterion §1.3 — head 1's last-row argmax lands on the
preceding position at the `tuned` preset — depends on the ratio between `PE_SCALE` and the
embedding magnitudes. `PE_SCALE = 0.35` is the starting value; implementation may tune it
within `[0.25, 0.80]` to satisfy the test, and must not change the `tuned` embeddings to do
so (they are what §1.4's and §6's presets depend on). If no value in that range satisfies
it, the fallback is to raise `PE_SCALE` to 1.0 and record in this spec that head 1 is
positional at the cost of the embeddings being a weaker signal — a spec revision, not a
silent change.

### 3.8 What `forward` returns

One call, given `{ embeddings, sequence, positional }`, returns everything the scene draws:

```ts
interface Forward {
  readonly x: readonly Float64Array[]; // per position, after embed + position
  readonly heads: readonly HeadPass[]; // one per head
  readonly attnOut: readonly Float64Array[]; // after W_O
  readonly xResid: readonly Float64Array[]; // x + attnOut
  readonly mlpOut: readonly Float64Array[];
  readonly xFinal: readonly Float64Array[]; // xResid + mlpOut
  readonly logits: Float64Array; // length 8, from xFinal[last]
}

interface HeadPass {
  readonly q: readonly Float64Array[];
  readonly k: readonly Float64Array[];
  readonly v: readonly Float64Array[];
  readonly scores: readonly Float64Array[]; // row i has length i+1; masked entries absent
  readonly weights: readonly Float64Array[]; // same shape, rows sum to 1
  readonly out: readonly Float64Array[];
}
```

The temperature is deliberately not an input to `forward`: `probabilities(logits, T)` is a
separate export, so moving the slider costs one softmax rather than a whole forward pass.

## 4. Layout (`viz/gpt/layout.ts`, pure, unit-tested)

Z-up, as everywhere in this repo. The wall is the plane y = 0; the floor is z = 0 extending
in −y in front of it, exactly as in the neural network scene.

```
WALL_W = 6      WALL_H = 4.6      WALL_OPACITY = 0.18
column x        [-2.4, -1.2, 0, 1.2, 2.4]
band z          embed 0.5   attention 1.5   residual 2.5   mlp 3.4   logits 4.2
floor           x in [-3, 3], y in [-6, 0]
```

Two pure conversions, round-trip tested:

```
floorFromEmbed(e) = ( 1.4 * e.x, -3 + 1.4 * e.y )
embedFromFloor(p) = ( p.x / 1.4, (p.y + 3) / 1.4 )
```

The embedding domain `[-2, 2]²` therefore maps to `x in [-2.8, 2.8]`, `y in [-5.8, -0.2]`:
inside the floor with a margin, so a dragged word can reach the domain edge but not leave
the floor. `embedFromFloor` clamps to the domain.

A token's 2-vector is drawn inside its column as an arrow in the wall plane, from the band
point outward: `(x_col + GLYPH * v.x, 0, z_band + GLYPH * v.y)` with `GLYPH = 0.30` and the
length clamped at 0.75 so a large vector cannot reach into the neighbouring column
(half the 1.2 column pitch, less the arrowhead).

## 5. Scene

### 5.1 Wall (`wall.ts` shared helper, unchanged)

The translucent y = 0 plane with its outline, `WALL_W × WALL_H` at `WALL_OPACITY`. Per the
repo's readability note, lines drawn on it use `--soft`, never `--line`.

### 5.2 Stage bands (`wall-bands.ts`)

Five horizontal guide lines across the wall at the band heights, in `--soft`, each with an
HTML label at its right edge (`embed + position`, `attention`, `+ residual`, `MLP`,
`logits`). A band not in focus drops to 0.25 of its opacity; `all` leaves every band at full.

### 5.3 Token columns (`columns.ts`)

Five vertical lines from the embed band to the MLP band, one per sequence position, with the
word as an HTML label below the wall's bottom edge. At each of the four vector bands
(embed, attention output, residual, MLP output) the column carries an arrow glyph for that
position's vector at that stage, coloured `--ink`. The selected query column is drawn in
`--accent` and one step brighter.

Five clickable hit boxes, one per column, as in `backprop/hit-boxes.ts`: a click selects that
column as the query.

### 5.4 Attention arcs (`arcs.ts`, pure geometry in `arcs-geometry.ts`)

For the selected query position `i` and the selected head (or the `W_O`-weighted combination
when both are shown), one ribbon per visible key `j <= i`: a quadratic Bézier from
`(x_j, 0, z_attn)` to `(x_i, 0, z_attn)`, control point at the midpoint lifted by
`0.25 + 0.35 * |x_i - x_j|` in z, offset −0.06 in y so it floats in front of the wall.
Twenty-four segments, built as a triangle strip with half-width
`0.010 + 0.075 * weight`, `MeshStandardMaterial`, `DoubleSide`, `--accent`.

Never negate normals (WebGPU's `DoubleSide` path multiplies by `faceDirection`); the strip is
emitted in a consistent winding, and `arcs-geometry.ts` is where that is tested. At most five
arcs exist at once, so the geometry is preallocated for five and the unused tail collapses to
zero-length — and `commit()` hides the mesh when the count is zero, per the shared layers'
zero-vertex rule.

When the focused stage is `scores`, ribbon width comes from the raw score mapped through
`0.010 + 0.075 * clamp((s - min) / (max - min), 0, 1)` instead of the weight, and a small `×`
marker sits at each masked position `j > i` so the causal mask is visible rather than implied.

### 5.5 Probability bars (`bars.ts`)

Eight bars in a row across the logits band, one per vocabulary word in vocabulary order, each
`0.28` wide with height `0.55 * p / max(p)` so the tallest always fills the band, coloured
`--accent`, each with an HTML label. A leader line runs from the top of the last token's
column up to the row, so the bars read as belonging to that column.

### 5.6 Embedding floor (`floor-embed.ts`)

The floor is a plain rectangle in `--faint`, not a vertex-coloured field — there is no scalar
field to paint here, and the nn scene's readability lesson (a coloured field and the points on
it must not share a colour pair) does not arise.

Eight spheres of radius `0.09` at `floorFromEmbed(embedding[v])`, coloured `--ink`, each with
its word as an HTML label, each a drag hit target. A thin `--soft` ray runs from
`floorFromEmbed(0, 0)` through each point out to the floor edge: the unembedding direction for
that word. The ray for the word with the highest probability is drawn in `--accent`.

### 5.7 Residual path on the floor (`residual-path.ts`)

For the selected query position, three arrows chained on the floor: from its embedding to
`x` (the positional shift), from `x` to `xResid` (what attention added), from `xResid` to
`xFinal` (what the MLP added). Coloured `--soft`, `--accent`, `--ink` respectively, each with
a short HTML label (`+ position`, `+ attention`, `+ MLP`). A hollow ring marks `xFinal`.

This is what ties the two surfaces together: the wall shows the pipeline's shape, and this
shows the same token's vector actually moving through embedding space toward whichever word
comes next.

### 5.8 Labels (`labels-sync.ts`)

One HTML overlay via the shared `labels.ts`: band names, the five sequence words, the eight
vocabulary words, the eight bar labels, the three residual-path labels. 13 px on a translucent
`--bg` pill, per the repo's convention. Rebuilt only when the label set changes; re-projected
whenever the camera moves or the canvas resizes.

### 5.9 Camera (`frame-gpt.ts`, pure)

Both surfaces must read at once: the wall needs to be near-frontal for the arcs and the
columns to be legible, and the floor needs enough obliquity for the eight points to separate.
The framing looks from the −y, +z octant, slightly off-axis in x, targeting a point between
the wall's centre and the floor's near edge. Computed once and reused by Reset view, as in the
nn scene. Returns a `Framing`.

## 6. Controls (side panel, in order)

1. **Sentence** — select: `the cat sat on the` (default), `the dog ran on the`,
   `on the mat sat cat`.
2. **Embeddings** — select: `tuned` (default), `collapsed`, `spread`; plus a **Reset
   embeddings** button that returns the current preset's positions after they have been
   dragged.
3. **Query token** — select over the five positions, defaulting to the last. Kept in sync
   with clicking a column, so the scene is usable without the 3D interaction.
4. **Head** — select: `head 1`, `head 2`, `both` (default). `both` draws the
   `W_O`-weighted combination `0.6 a¹ + 0.4 a²` and says so in the readout.
5. **Stage** — select: `all` (default), `embed + position`, `scores`, `softmax`,
   `weighted sum`, `+ residual`, `MLP`, `logits`. Dims the other bands and expands the
   focused stage's equation and numbers in the readout.
6. **Temperature** — logarithmic slider, `0.2` to `3.0`, default `1.0`, formatted by the
   shared `proseNum`.
7. **Toggles** — `positional encoding` (on), `causal mask` (on), `residual path` (on).
   Turning the mask off is the second lesson of the scene: the last token starts reading
   tokens that come after it, which in a real model would be reading the answer.
8. **Reset view**.

## 7. Readouts and explanation

The readout under the controls shows, for the focused stage, the equation via the shared
`createEquation` and the current numbers for the selected query:

| Stage            | Equation                                                | Numbers                                                    |
| ---------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| all              | `Attention(Q,K,V) = softmax(QKᵀ/√d) V`                  | the selected row's weights, and the top-3 next tokens      |
| embed + position | `x_p = e_{t_p} + pe(p)`                                 | the query's embedding, its `pe(p)`, and their sum          |
| scores           | `s_ij = (q_i · k_j)/√d`                                 | the raw score row, with masked entries shown as `—`        |
| softmax          | `a_i = softmax(s_i)`                                    | the weight row, summing to 1                               |
| weighted sum     | `o_i = Σ_j a_ij v_j`                                    | each `a_ij v_j` term and the total                         |
| + residual       | `x'_i = x_i + o_i`                                      | the two vectors and their sum                              |
| MLP              | `x''_i = x'_i + W₂ tanh(W₁ x'_i + b₁) + b₂`             | the hidden four activations and the output vector          |
| logits           | `p = softmax(x''_last · E / T)`                         | all eight logits and probabilities, sorted                 |

The explanation panel covers, in this order: what a block does; why `d_model = 2` and what it
costs (the §3.4 limitation, in one paragraph); what the two heads lean toward; why layer norm
is absent (§3.6); and that there is no training here, with a link to the neural network scene
for that.

## 8. Files and shared changes

New:

```
src/core/math/transformer.ts        vocab, presets, sequences, constants, forward, probabilities
src/viz/gpt/index.ts                assembly, drag, click-to-select, update/resize/dispose
src/viz/gpt/state.ts                GptState, derived, setters
src/viz/gpt/layout.ts               constants, floorFromEmbed / embedFromFloor, glyph math
src/viz/gpt/wall-bands.ts           band lines + focus dimming
src/viz/gpt/columns.ts              columns, vector glyphs, selection
src/viz/gpt/hit-boxes.ts            five column pick targets
src/viz/gpt/arcs.ts                 ribbon meshes
src/viz/gpt/arcs-geometry.ts        pure Bézier + triangle-strip math
src/viz/gpt/bars.ts                 probability bars
src/viz/gpt/floor-embed.ts          floor, vocab spheres, unembedding rays
src/viz/gpt/residual-path.ts        the selected token's arrow chain on the floor
src/viz/gpt/panel.ts                controls
src/viz/gpt/panel-readouts.ts       the §7 table
src/viz/gpt/labels-sync.ts          label overlay sync
src/viz/gpt/explanation.ts          prose
src/viz/gpt/frame-gpt.ts            camera framing
```

Changed:

- `src/app/registry.ts` — the `gpt-transformer` roadmap entry becomes a `LazyVisualization`
  with `load: () => import("../viz/gpt").then((m) => m.gptTransformer)`. The existing
  registry test asserts the loaded module's `id`/`topic`/`title`/`summary` equal the entry's,
  so both copies must match.
- `vite.config.ts` — nothing. The scene is another lazy chunk under the existing
  `codeSplitting.groups`.
- `README.md` and `docs/roadmap.md` — move the scene from in-flight to live.

No changes to `src/viz/shared/*` are anticipated. If the ribbon geometry in §5.4 turns out to
be useful to a later scene it can move to `shared/` then, not now.

## 9. Tests

`tests/` mirrors `src/`, as it does today.

**`core/math/transformer.test.ts`**

1. Every attention row, both heads, every sequence, all three presets: sums to 1 within 1e-12.
2. Row `i` has exactly `i + 1` entries — the causal mask leaves nothing for `j > i`.
3. Positional encoding off: the two `the` positions in `cat-sat` have bit-identical `q`, `k`
   and `v` in both heads. On: they differ.
4. Weight tying: `logits[v]` equals `dot(xFinal[last], embedding[v])` for all `v`.
5. A hand-computed fixture — two positions, head 1 only, embeddings `(1,0)` and `(0,1)`,
   positional encoding off — matches to 1e-12.
6. `tuned` with positional encoding on: `argmax` of head 1's last row is position 3
   (success criterion §1.3).
7. `collapsed`: every weight in the last row is within 0.15 of 0.2 (criterion §1.4).
8. The `W_O`, `W1`, `b1`, `W2`, `b2`, `W_Q`, `W_K`, `W_V` constants equal the values in §3
   (a change-detector, deliberately, per §3.5).
9. `probabilities` sums to 1 and is monotone in the logit order for every `T` in
   `{0.2, 1, 3}`; a low `T` concentrates more mass on the argmax than a high `T`.
10. Determinism: two `forward` calls on equal inputs return equal numbers.

**`viz/gpt/layout.test.ts`** — `floorFromEmbed` / `embedFromFloor` round-trip to 1e-12 over
the domain corners and centre; `embedFromFloor` clamps a point outside the floor into
`[-2, 2]²`; the glyph length clamp never exceeds half the column pitch.

**`viz/gpt/arcs-geometry.test.ts`** — endpoints land exactly on the two columns' band points;
the control-point lift grows with `|Δx|`; half-width is monotone in the weight and positive at
weight 0; the strip's triangle winding is consistent for a left-to-right and a right-to-left
arc; a zero-arc call produces zero vertices.

**`viz/gpt/state.test.ts`** — setters are pure and return new objects; selecting a query
outside `0..4` is rejected; toggling the mask off widens the last row to five entries;
dragging a vocabulary point changes only that point.

**`app/registry.test.ts`** — already covers metadata parity; it will exercise the new loader
once the entry becomes lazy.

## 10. Risks

| Risk                                                                                              | Mitigation                                                                                                                     |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `d_model = 2` cannot separate positional from content information, so the heads are impure        | Stated in §3.4 and in the explanation panel; head 1's behaviour is pinned by a test rather than asserted in prose              |
| Criterion §1.3 may not hold at any `PE_SCALE` in `[0.25, 0.80]`                                   | §3.7 names the fallback (`PE_SCALE = 1.0`) and requires a spec revision rather than a silent change                            |
| Five arcs plus five columns plus eight bars on one wall may read as clutter                       | One query row at a time, non-focused bands dimmed, and a Chrome MCP pass in both themes before merge; arcs float 0.06 off the wall so they never z-fight |
| Attention is split between the wall and the floor — the option-A risk                             | The floor carries the residual path (§5.7) for the same token the arcs belong to, so the two surfaces show one story           |
| Ribbon geometry with `DoubleSide` under WebGPU                                                    | Consistent winding, no negated normals, tested in `arcs-geometry.test.ts`; the repo's `PlaneGeometry` lesson applies           |
| Eight vocabulary labels plus five word labels plus eight bar labels may overlap at some camera angles | Labels are 13 px on `--bg` pills; the framing is fixed and validated by screenshot; bar labels alternate two rows if they collide |
| Weight tying makes the bars depend on embedding *magnitude*, so dragging a word outward raises its probability regardless of direction | Called out in the explanation panel as a real property of tied unembeddings; the `spread` preset makes it visible on purpose |

## 11. Walkthrough mode

Walkthrough mode is specified separately and built after this scene. This spec's only
obligation to it: every control in §6 is driven by a pure setter in `state.ts` returning a new
`GptState`, and the stage-focus selector (§6.5) gives a walkthrough a natural per-step target.
Nothing here should reach into the scene's Three.js objects to change state.
