# Roadmap

What is live, what is being built, and what is queued. Each queued entry carries enough
detail to start a spec from it: the concept, what the viewer manipulates, what it reuses
from `src/`, and why it earns a card on the home page.

The bar for a card: **the concept must be one you can put your hands on.** If the insight
arrives by reading a paragraph rather than by dragging something and watching it respond,
it belongs in a scene's explanation panel, not in a scene of its own.

## Live

| Topic          | Scene                  | Spec                                                    |
| -------------- | ---------------------- | ------------------------------------------------------- |
| Calculus       | Derivative & tangent   | `specs/2026-09-03-derivative-explorer-design.md`         |
| Calculus       | Chain rule graph       | `specs/2026-09-03-chain-rule-graph-design.md`            |
| Linear algebra | Matrix transformation  | `specs/2026-09-03-matrix-transformation-design.md`       |
| ML             | Gradient descent       | `specs/2026-09-03-ai-lab-design.md`                      |
| ML             | Backprop graph         | `specs/2026-09-03-backprop-graph-design.md`              |
| ML             | Neural network         | `specs/2026-09-04-neural-network-design.md`              |
| ML             | GPT transformer        | `specs/2026-09-04-gpt-transformer-design.md`            |

## In flight

1. **Walkthrough mode** (shell) — optional numbered steps that drive any scene's state,
   so a card can be read as a lesson rather than a sandbox. The GPT transformer's assembler
   was built with this in mind: `apply(nextState)` is a single entry point over pure setters,
   and every scene's panel already renders from state alone.

## Tier 1 — next up

Approved on 2026-09-04, one per topic. Build order is the owner's call; each is
independent of the others.

### SVD & low-rank approximation (linear algebra)

Every matrix is a rotation, then an axis-aligned stretch, then another rotation. Show a
2×2 matrix decomposed into those three moves with a scrub bar between them, so the unit
circle becomes an ellipse whose axes _are_ the singular values — then generalise: a rank
slider rebuilds a small greyscale image from its first _k_ singular vectors, with the
residual shown beside it. The payoff is the idea underneath PCA, embedding compression
and LoRA: most of a matrix's action lives in a few directions.

Reuses `matrix-transformation`'s plane, basis vectors and presets wholesale; needs a
`core/math/svd.ts` (a 2×2 closed form for the geometric half, one-sided Jacobi for the
image half) and a small image shipped in `public/`. The scrub-bar-between-stages control
is the same shape walkthrough mode wants, so build it after walkthrough if both are
queued.

Prerequisite reading order on the home page: matrix transformation → SVD.

### Taylor series approximation (calculus)

The derivative scene's punchline is "zoom in far enough and the curve _is_ its tangent."
Taylor is that idea at every order at once: pick a centre, raise the order with a slider,
and watch degree 0, 1, 2, 3… successively hug the curve while an error band underneath
shrinks and then — outside the radius of convergence — blows up. Dragging the centre
shows the approximation is local, which is the whole point.

Reuses `derivative`'s vertical plane, curve layers, draggable point, the band underneath
and the domain-rescale zoom; the new math is a `taylorCoefficients` helper over the
existing `functions1d.ts` (analytic derivatives per function rather than numeric, so the
high orders stay clean). Good functions: sin, exp, 1/(1−x) (finite radius),
log(1+x), |x| (no expansion — a deliberate failure case).

### Overfitting: bias, variance & regularization (ML)

The gap most visible in the ML row: every scene so far fits training data with no notion
of generalising. One noisy 1D dataset split into train and validation points, a
model-capacity slider (polynomial degree, or hidden width if it reuses the MLP), and an
L2-strength slider. The fit curve wiggles through every training point as capacity rises
while the validation points drift away from it, and the two loss curves in the band
underneath cross — the classic U. Turning up L2 pulls the wiggle back out and moves the
crossing point.

Reuses `derivative`'s vertical plane and band, `nn`'s train/step/play control cluster and
`core/math/prng.ts` for a reproducible split. Needs least-squares polynomial fitting with
a ridge term in `core/math/`. The "resample the noise" button matters: it shows variance
as a property of the _procedure_, not of one unlucky dataset.

## Tier 2 — strong candidates, not yet scheduled

- **Dot product & projection** (linear algebra) — drag two vectors; the projection foot,
  the cosine and the sign of the dot product respond. Cheap to build and it is the exact
  operation an attention score is, so the transformer scene should be able to link to it
  as a prerequisite. The strongest Tier 2 entry for that reason.
- **Matrix multiplication as composition** (linear algebra) — two matrix cards in a row,
  the plane transformed through A then B with a scrub between them. Shows AB ≠ BA and why
  a deep net is a stack of transforms. Nearly free on top of `matrix-transformation`.
- **Partial derivatives & the gradient field** (calculus) — the gradient-descent surface
  with the two partials as slices through the point and ∇f drawn as an arrow field on the
  floor. Closes a real gap: `derivative` is 1D and `gradient-descent` already assumes you
  know what a gradient is. Reuses the surface, contours and arrow helper.
- **Curvature: the Hessian, and why Adam helps** (calculus/ML) — a ravine surface with
  the local quadratic bowl drawn on it, showing why plain SGD zig-zags across the valley
  and what a per-parameter step size fixes. Best built together with the optimizer race.
- **Optimizer race: SGD, momentum, Adam** (ML) — three markers descending the same
  surface from the same start, paths and step sizes compared. The cheapest scene on this
  whole list: `gradient-descent` already owns the surfaces, `optimizers.ts` and the path
  lines. Could ship as a mode of the existing scene rather than a new card.
- **Softmax & temperature** (ML) — drag logit bars, watch probabilities respond, flatten
  or sharpen with a temperature slider, and see sampling draws land in a histogram.
  Whether this earns its own card depends on how much of it the transformer scene
  already shows; decide after the transformer ships.
- **Embedding space & cosine similarity** (ML) — a real word-vector cloud projected to
  3D; drag a query token and its nearest neighbours light up, with
  king − man + woman as a preset arrow. The one entry that needs a shipped data asset
  (a few hundred vectors, quantised), which is why it is not Tier 1.
- **Span, basis & linear independence** (linear algebra) — drag vectors and watch the
  span collapse from plane to line to point. Fundamental, but the least connected to the
  ML thread of the linear-algebra candidates.
- **Integral as accumulation** (calculus) — Riemann bars filling under a curve as the
  width shrinks, with the running total as a second curve. Rounds out calculus; nothing
  in the ML thread needs it yet.

## Tier 3 — long tail

One line each. Not evaluated in detail; several may not deserve a card at all.

**LLM internals.** Tokenization and BPE merges (a text box that shows the merge tree);
positional encoding (the sinusoidal band, and why relative position falls out of it);
KV cache and autoregressive decoding (what is recomputed per token and what is not);
sampling strategies compared (greedy, top-k, top-p, beam) over one fixed distribution;
mixture of experts and router load; scaling laws (loss vs compute on log axes).

**Training.** Cross-entropy and KL divergence as the distance between two distributions;
layer norm vs batch norm (what each one centres); dropout as an ensemble; the
activation-function zoo and what each does to a decision boundary; learning-rate
schedules and warmup; vanishing gradients and what a residual connection fixes.

**Classical ML.** Linear regression and least squares as the residual-minimising line;
logistic regression's boundary (largely covered by the neural network scene); k-means
iterating to convergence; PCA (fold into SVD rather than building twice);
convolution and feature maps.

## Notes for whoever picks this up

- Process: spec in `docs/superpowers/specs/`, reviewed by a spec-document-reviewer
  subagent until approved, then a plan in `docs/superpowers/plans/`, then task-by-task
  implementation with a spec-compliance and a code-quality review per task.
- Validate in the real browser with the Chrome DevTools MCP before merging — screenshot
  both themes into `docs/screenshots/`, exercise every control, confirm a clean console.
- Read `README.md`'s "Adding a visualization" section first; the shared building blocks
  in `src/viz/shared/` cover most of what a new scene needs.
- Keep the linear-algebra row growing. It has one scene against the ML row's four, and
  every ML concept here rests on it.
