# Walkthrough Mode Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-trainual:subagent-driven-development (if subagents available) or superpowers-trainual:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship optional numbered walkthroughs on all seven live scenes: each step sets the scene up, says in one paragraph what to do, and outlines the control it names, with the step linkable in the URL and the scene staying fully interactive throughout.

**Architecture:** Ownership inverts from the obvious design. Each scene's state type is private to its assembler, so **scenes own typed steps** built from their own pure setters and their own `ControlId` union; **the shell owns** the banner, step card, Back/Next and the URL, and sees only a `StepView` of plain data. `goTo(i)` replays steps 0…i over a freshly allocated initial state, which is what makes a cold-load deep link work and makes Back and Next symmetric.

**Tech Stack:** Vite 8 (Rolldown), strict TypeScript (`noUncheckedIndexedAccess`), three 0.185, vitest (jsdom for DOM). Branch `walkthrough-mode` off `main` (already created); fast-forward merge at the end.

**Spec:** `docs/superpowers/specs/2026-09-05-walkthrough-mode-design.md` (approved, revision 4, two review rounds; wins over this plan).

**Conventions for every task:** `pnpm check` green before committing; commit with `git commit --only <paths>` (never `-a`); check `git show --stat HEAD`; trailer `Claude-Session: https://claude.ai/code/session_01NL7fLdagpFezkhQfNxt2CL` on its own line after a blank line; no hard-coded colours; every listener disposed; files under ~160 lines (report rather than splitting unilaterally); read vitest output with `rtk proxy pnpm vitest run <path>`; keep scratch files in the session scratchpad, never under `tests/`.

**Three policies this codebase enforces in review, each of which caught real bugs on the last build:**

1. **No `??` silent defaults on index reads**, source or tests — named throws stating the invariant.
2. **No test may assert against the same constant the implementation reads**, and none may derive its expected value from the function under test. Watch especially for assertions that *agree with themselves*: asserting a new object came back proves nothing about mutation; a duplicated literal list of control ids proves nothing about the registry.
3. **Nothing may be equal to something else only by coincidence.** Eight instances were found on the last build.

**Mutation-check your own suite before reporting, and give the table. A mutation that passes is a finding, not a failure — say so rather than hiding it.**

**Two traps the spec review found; do not rediscover them:**

- **Determinism, not idempotence.** `enter(enter(s))` may legitimately differ from `enter(s)` — a step that advances an optimizer or trains epochs moves `pos`, `steps`, `optState`. Never assert applying twice equals once.
- **`GdState.path` is deliberately mutable** (`gradient-descent/state.ts:18-28`). Do not "fix" it; copying a 2000-entry `RingBuffer` per frame is the cost that design avoids. Purity is scoped to each scene's diffing surface.

**Files:**

```
src/viz/shared/walkthrough.ts        Step<S,C>, createWalkthrough, replay      + tests
src/app/walkthrough.ts               banner, step card, Back/Next/Exit, keys   + tests
src/viz/<id>/walkthrough.ts          × 7, the steps                            + tests
src/viz/types.ts                     StepView, WalkthroughInstance, VizInstance.walkthrough
src/app/router.ts                    four-segment form; redirect gains a target
src/app/viz-page.ts                  three panel regions; clamp; URL sync
src/ui/panel.ts                      section(title, { role: "explanation" })
src/viz/<id>/panel.ts                × 7, ControlId union + Record registry + focus(id)
src/viz/<id>/index.ts                × 7, wire createWalkthrough into mount
styles/panel.css                     .is-focused, .wt-banner, .wt-step, .wt-active
```

---

## Chunk 1: The seam

### Task 1: Types and the replay engine

**Files:** modify `src/viz/types.ts`; create `src/viz/shared/walkthrough.ts`; test `tests/viz/shared/walkthrough.test.ts`.

- [ ] **Step 1: Failing tests** (spec §3, §4, §10). `goTo(i)` equals folding `enter` over `initial()`; `goTo(2)` after `goTo(5)` equals `goTo(2)` from fresh; `exit()` restores `initial()`; an index outside `0…length-1` throws a named error; a zero-step walkthrough is rejected at construction; `title` and `length` are exposed. **The `initial` contract (§4):** two `goTo(i)` calls produce equal contents but **must not alias** — assert object identity differs for a field the fake scene mutates in place, so a memoized `initial: () => s0` fails here rather than quietly growing a shared buffer. Changing state between `goTo` calls changes neither `length` nor the reported index (§1.5).
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement.** `Step<S, C extends string>` and `createWalkthrough<S, C>` per spec §4. `StepView` carries **no `focus`** — the scene applies its own outline, because only the scene knows its ids. `VizInstance.walkthrough` is optional; adding it must not require any change at the six existing scenes' call sites.
- [ ] **Step 4:** Run, `pnpm check`; commit "Add the walkthrough replay engine and its seam on VizInstance".

### Task 2: Routing

**Files:** modify `src/app/router.ts`; test `tests/app/router.test.ts`.

- [ ] **Step 1: Failing tests** (spec §6). Work from §6's redirect table — it names every case and who owns it. Here: `#/<topic>/<id>/walkthrough/<n>` parses to a 0-based `step`; `n` of `0`, negative or non-numeric yields the scene with **no** step; a third segment other than `walkthrough` yields home; an unknown entry yields home. `ResolvedRoute`'s redirect arm carries a **target hash** and `createRouter` navigates to it rather than the hardcoded `#/` at `router.ts:99-101`. **The existing "unknown hash → `#/`" test must stay green** — the new target must not swallow it. Existing one- and two-segment routes parse unchanged.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement.** The router **parses only**. Clamping an out-of-range `n` and redirecting a walkthrough-less scene are *not* here: both need `walkthrough.length`, which exists only after `mount()`, and `resolveRoute` sees registry metadata alone. They belong to Task 4.
- [ ] **Step 4:** Run, `pnpm check`; commit "Parse the walkthrough route and give redirects a target".

### Task 3: Panel regions and control focus

**Files:** modify `src/ui/panel.ts`, `styles/panel.css`; create `src/app/walkthrough.ts`; tests `tests/app/walkthrough.test.ts`, `tests/ui/panel.test.ts`.

- [ ] **Step 1: Failing tests** (spec §5, §7). Panel: `section(title, { role: "explanation" })` marks that section so a wrapper can collapse it; sections without a role are unchanged (the six existing scenes' panel tests must stay green). Chrome: the banner shows `index + 1` of `total` and the `title`; Back is disabled on the first step; Next on the last reads **Finish** and exits; Exit clears the chrome and calls `walkthrough.exit()`; `→`/`←` advance and retreat, `Esc` exits, and **all three are ignored while focus is inside a form control**; the step card is scrolled into view on each advance.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement.** The chrome reads `StepView` only and never inspects scene state. `.is-focused` is a 2px `--accent` outline plus a slight background lift, defined once. Do **not** add per-scene slots — Task 4 gives the shell its own regions.
- [ ] **Step 4:** Run, `pnpm check`; commit "Add the walkthrough chrome and the panel's explanation role".

### Task 4: Wiring in the viz page

**Files:** modify `src/app/viz-page.ts`; test `tests/app/viz-page.test.ts`.

- [ ] **Step 1: Failing tests** (spec §5, §6). The panel host wraps three regions — `.wt-banner`, `.wt-scene`, `.wt-step` — and **the scene receives only the middle one as `host.panel`**, so no scene's panel code changes. `.wt-active` on the wrapper collapses the section registered with `role: "explanation"`. The two post-mount redirect rows of §6's table: a `step` past the end clamps to the last and rewrites the hash; a `step` on an instance with no `walkthrough` rewrites to the plain scene. Advancing, retreating, exiting and finishing rewrite the hash without pushing history entries, so the browser Back button leaves the scene rather than walking steps backwards. A scene with no walkthrough renders no chrome at all.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run, `pnpm check`; commit "Give the walkthrough chrome its own regions and own the post-mount redirects".

---

## Chunk 2: Proving the seam on two scenes

### Task 5: GPT transformer walkthrough

**Files:** modify `src/viz/gpt/panel.ts`, `src/viz/gpt/index.ts`; create `src/viz/gpt/walkthrough.ts`; test `tests/viz/gpt/walkthrough.test.ts`.

- [ ] **Step 1: Failing tests** (spec §7, §8, §10). Panel: `export type GptControlId` covering its ten controls, a `Readonly<Record<GptControlId, HTMLElement>>` registry that is **exhaustive by construction**, and `focus(id | undefined)`. Walkthrough, over every step: `enter` is **deterministic** over the diffing surface (two calls on the same input agree; the input's diffed fields are unchanged after) — *not* idempotent; every `focus` resolves against a **really-mounted** panel's registry, read from an actual `createGptPanel(...)` call and never a literal list restated in the test; a fixture pins the **value** of state at two chosen steps; prose is non-empty and passes the phrasing lint.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement** the 6–9 step script from spec §8: words on the floor are embedding space → the pipeline on the wall → click a column, arcs fan back → `collapsed` isolates head 1's positional bias → the mask off → drag a word toward the final vector and watch its bar take over.

  **The prose must not contradict the scene's explanation panel**, which already states three true-but-misleading properties (that scene's spec §3.4, §3.7, §10): head 1 is previous-position-*biased* and content wins at `tuned`; the block predicts the token it just read; a tied unembedding rewards dragging a word further out *on the same side as* the final vector. Where a step touches one, it says the same thing. Steps describe **what to do and what will happen**, never what is currently on screen — controls stay live.
- [ ] **Step 4:** Run, `pnpm check`; commit "Add the GPT transformer's walkthrough".

### Task 6: Gradient descent walkthrough

**Files:** modify `src/viz/gradient-descent/panel.ts`, `index.ts`; create `src/viz/gradient-descent/walkthrough.ts`; test `tests/viz/gradient-descent/walkthrough.test.ts`.

- [ ] **Step 1: Failing tests.** As Task 5, plus the two this scene exists in the plan to prove: the purity test **names `path` as excluded** (`state.ts:18-28`) rather than silently passing, and the script's stepping steps are asserted **deterministic, not idempotent**. Also assert replay rebuilds the trail: `goTo(i)` leaves exactly the positions `i` presses of Step would have.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3: Implement** spec §8's script: the surface → drag the ball, the gradient arrow follows → the tangent plane → step the optimizer → compare SGD and Adam on the ravine → the Rosenbrock valley.

  This scene is in Chunk 2 deliberately: it is the oldest and simplest, and it stresses the seam from the opposite end to the transformer. **If the abstraction has to bend to fit it, stop and report** — that is what this task is for, and bending it here is far cheaper than discovering it in five more scripts.
- [ ] **Step 4:** Run, `pnpm check`; commit "Add the gradient descent walkthrough".

---

## Chunk 3: The remaining five scripts

Only start this chunk once Tasks 5 and 6 are both reviewed and closed. Each task is the same shape: a `ControlId` union and registry on the panel, a `walkthrough.ts`, a test covering determinism / registry resolution / a value fixture / prose, and the wiring in `index.ts`.

### Task 7: Derivative & tangent

- [ ] Script per spec §8: the curve → drag the point, the tangent follows → shrink h, the secant rotates onto it → the derivative curve underneath → the corner of |x| → zoom until the curve is its tangent.
- [ ] Tests as Task 5; `pnpm check`; commit.

### Task 8: Chain rule graph

- [ ] Script per spec §8: three graphs in a corner → drag x, watch Δu appear → the shared Δu leg → Δy on the side wall and floor → shrink Δx → the three slopes multiply.
- [ ] Tests as Task 5; `pnpm check`; commit.

### Task 9: Matrix transformation

- [ ] Script per spec §8: the unit square → drag one basis vector → the determinant as signed area → flip the sign, the fill changes → the eigenvectors as the lines that do not turn → a preset.
- [ ] Tests as Task 5; `pnpm check`; commit.

### Task 10: Backprop graph

- [ ] Script per spec §8: leaves are given → step the forward pass → the output → step the backward pass → local derivatives on the edges → the node that feeds two consumers accumulates.
- [ ] Tests as Task 5; `pnpm check`; commit.

### Task 11: Neural network

- [ ] Script per spec §8: the untrained boundary → press Play → the boundary bends toward the data → drag the probe → the activations behind one prediction → switch to two moons.
- [ ] **This scene's trap, from spec §4:** `NnState.epoch` advances on wall-clock time while `playing`, so a "press Play" step followed by any advance replays from `initialState()` and snaps the network back to epoch 0, un-training the boundary mid-script. Steps must call `trainEpoch` a **fixed number of times inside `enter`** rather than depend on Play having run. Assert the epoch count at a stepped-through state.
- [ ] Tests as Task 5; `pnpm check`; commit.

---

## Chunk 4: Ship

### Task 12: Docs, browser validation, merge

- [ ] **Step 1: Full suite.** `rtk proxy pnpm vitest run`. **All seven scenes' pre-existing test files must pass untouched** — that is what proves `VizInstance.walkthrough` is genuinely optional and that adding panel registries regressed nothing.
- [ ] **Step 2: Browser validation** (required before merge). `pnpm dev`, then via the Chrome DevTools MCP: walk **every one of the seven** walkthroughs end to end; confirm the outlined control is the one the prose names; confirm the step card is in view on each advance; load a deep link cold (`.../walkthrough/3`) in a fresh tab; try `.../walkthrough/99` and confirm it clamps; try a walkthrough URL on a scene before its script exists and confirm it redirects; change a control mid-step and confirm the walkthrough neither exits nor advances; screenshot both themes into `docs/screenshots/`; confirm the console is clean.
- [ ] **Step 3: Docs.** `README.md` and `docs/roadmap.md` — walkthrough mode moves from in-flight to live, and the roadmap's in-flight list empties.
- [ ] **Step 4: Commit and merge.**
```bash
pnpm check
git checkout main && git merge --ff-only walkthrough-mode
```
Pushing `main` deploys to Pages — **ask before pushing**.
