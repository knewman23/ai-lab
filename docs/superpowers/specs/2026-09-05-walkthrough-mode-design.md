# Walkthrough mode — numbered steps that drive any scene, owned by the scene and framed by the shell

Date: 2026-09-05
Status: proposed
Parent: [AI Lab design](2026-09-03-ai-lab-design.md); the last item on that design's roadmap
Registry: no new cards. Every existing scene gains an optional walkthrough.

## 1. Purpose

Every scene is a sandbox: it opens in some state and waits. That suits someone who already
knows what to look for and strands everyone else. Walkthrough mode adds an optional numbered
sequence to a scene — each step sets the scene up, says in one short paragraph what to look at
or do, and outlines the control it is talking about — so a card can be read as a lesson without
ceasing to be a lab.

The scene stays live throughout. A step is a **starting position, not a cage**: once it lands
you can drag, toggle and orbit freely, and the walkthrough neither exits nor fights you.

Success criteria:

1. `#/machine-learning/gpt-transformer/walkthrough/3` opens that scene at step 3, from a cold
   load, with no prior navigation.
2. `goTo(i)` produces the same state whether reached by pressing Next `i` times, by pressing
   Back from a later step, or by loading the URL directly (asserted per scene in a test).
3. Every step's `focus` id resolves to a control that exists in that scene's panel (asserted
   per scene in a test). A typo fails the suite; it never silently highlights nothing.
4. Every step's `enter` is pure: applying it twice to the same state gives the same result, and
   the input state is not mutated (asserted per scene).
5. Changing a control mid-step does not exit the walkthrough and does not change which step is
   showing.
6. A scene with no walkthrough behaves exactly as it does today — no banner, no chrome, no
   route. `VizInstance.walkthrough` is optional and six of the seven scenes must keep passing
   their existing tests untouched.
7. All seven live scenes ship a walkthrough.

Out of scope: authoring walkthroughs outside the codebase (no JSON, no CMS); branching or
conditional steps; recorded animation or autoplay; per-user progress; a walkthrough that spans
more than one scene; changing any scene's existing controls or math.

## 2. Decisions

| Question           | Decision                                                                                                                                   | Alternatives                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Who owns the steps | The scene. Its state type is internal to its assembler and differs per scene, so steps must be typed where that type lives                  | The shell owns a step list and drives scenes generically                            |
| What a step does   | A pure `enter(state) => state` built from that scene's own setters                                                                          | `[setterName, value]` pairs looked up by string; a full target state per step        |
| Navigating         | `goTo(i)` **replays** steps 0…i over the scene's initial state                                                                              | Step forward from the current state; snapshot each step's state                     |
| Controls           | Stay live; touching one neither exits nor changes step                                                                                      | Any change exits; controls locked while a step shows                                |
| Layout             | The step replaces the explanation prose at the foot of the panel; a slim banner at the top carries progress and the exit                     | A card above the controls; a translucent bar over the canvas                        |
| Pointing           | The step names a control id; the panel outlines that control in place                                                                        | Prose alone ("use the Head select"); an arrow drawn on the canvas                   |
| URL                | `#/<topic>/<id>/walkthrough/<n>`, 1-based, clamped                                                                                          | In-memory only; a query parameter                                                   |
| Scope              | All seven scenes, built shell-first and proven on two before the other five are authored                                                     | Two scenes now, five later; the transformer alone                                   |

## 3. Who owns what

The natural design — the shell holds the steps and drives the scene — cannot work: `GptState`,
`NnState` and the rest are different types, private to their assemblers. So ownership inverts.

**The scene owns** its state, its steps, its prose and its focus targets, all fully typed
against its own setters. **The shell owns** the chrome: the banner, the step card, Back/Next,
and the URL. The seam between them is one optional member on `VizInstance`:

```ts
export interface StepView {
  readonly index: number; // 0-based
  readonly total: number;
  readonly prose: string;
  readonly focus?: string;
}

export interface WalkthroughInstance {
  readonly length: number;
  /** Replays steps 0…index over the scene's initial state and returns what to display. */
  goTo(index: number): StepView;
  /** Returns the scene to its initial state and drops any focus outline. */
  exit(): void;
}

export interface VizInstance {
  update(dt: number): boolean;
  resize(w: number, h: number): void;
  dispose(): void;
  readonly walkthrough?: WalkthroughInstance; // absent on a scene without one
}
```

`StepView` crosses the seam as plain data. The shell never sees a scene's state type, and a
scene never sees the DOM chrome.

## 4. The step model (`src/viz/shared/walkthrough.ts`)

```ts
export interface Step<S> {
  readonly prose: string;
  readonly enter: (state: S) => S;
  readonly focus?: string;
  readonly framing?: Framing;
}

export function createWalkthrough<S>(opts: {
  readonly steps: readonly Step<S>[];
  readonly initial: () => S;
  readonly apply: (state: S) => void;
  readonly focus: (id: string | undefined) => void;
  readonly frame?: (framing: Framing) => void;
}): WalkthroughInstance;
```

Each scene wires this in about five lines inside `mount`, passing its own `apply` and its
panel's `focus`.

**Replay, not stepping.** `goTo(i)` folds `steps[0].enter … steps[i].enter` over `initial()`.
Three things follow, and they are the reason for the design:

- A deep link to step 5 is reachable on a cold load, because step 5 does not depend on having
  pressed Next four times.
- Back and Next are symmetric — arriving at step 3 gives the same state either way, and the
  same state as loading its URL.
- A step author does not have to reason about what earlier steps left behind, only about what
  their own step needs to set.

The cost is that a viewer's own fiddling is discarded when the step changes. That is the
intended reading of §1's "a step is a starting position": you may explore freely within a step,
and advancing gives you a clean, known scene rather than your explored one plus a change.

`enter` must be pure and built from the scene's exported setters. It must not reach into the
scene's Three.js objects — every existing scene already routes all state through pure setters,
so this is a constraint the codebase already satisfies.

## 5. Shell chrome (`src/app/walkthrough.ts`)

Rendered by the viz page when `instance.walkthrough` exists, per §2's layout decision:

- **Banner**, a slim strip at the top of the panel: `WALKTHROUGH · 3/9` and an **Exit** control.
  Present only while a walkthrough is active.
- **Step card**, in the slot the explanation prose occupies, containing the step number, the
  prose, **Back** and **Next**. On the last step, Next reads **Finish** and exits.
- **Start control**, when no walkthrough is running: a single button near the top of the panel,
  labelled with the walkthrough's own name (e.g. "Walk me through it"), absent on scenes with
  no walkthrough.
- The panel scrolls the step card into view on each advance — the card sits low in a long
  panel, and a viewer who has scrolled up must not have to hunt for the next step.
- Keyboard: `→`/`←` advance and go back while the walkthrough is active and focus is not in a
  form control; `Esc` exits.

The chrome reads from `StepView` only. It never inspects scene state.

## 6. Routing (`src/app/router.ts`)

`parseHash` currently accepts one or two segments. It gains a four-segment form:

```
#/<topic>/<id>/walkthrough/<n>      n is 1-based
```

- `Route` gains `{ kind: "viz"; topic; id; step?: number }`; `step` is the 0-based index, or
  absent for the sandbox.
- A non-numeric, zero or negative `n` → redirect to the scene without a step.
- An `n` past the end clamps to the last step and **rewrites the hash**, so a stale link from an
  edited script lands somewhere sensible rather than blank.
- A scene with no walkthrough, given a walkthrough URL → redirect to the plain scene.
- Three segments, or a third segment other than `walkthrough` → home, as today.

Advancing, going back, exiting and finishing all rewrite the hash with `replaceState` semantics
(no new history entry per step), so Back-button behaviour stays coherent: the browser's Back
leaves the scene rather than walking the steps backwards.

## 7. Control focus, and the string that has to be safe

A step names a control by id; the panel outlines it. Every scene's panel gains two members:

```ts
readonly controlIds: readonly string[];      // every id this panel registered
focus(id: string | undefined): void;         // outline that control; undefined clears
```

The panel builds a `Map<string, HTMLElement>` as it creates its widgets — each `createSelect`,
`createSlider`, `createToggle` and `createButton` call site gains an id — and `focus` toggles a
`.is-focused` class (a 2px `--accent` outline and a slight background lift, defined once in
`styles/panel.css`). `focus(undefined)` clears. An unknown id **throws** rather than silently
doing nothing, consistent with the no-silent-defaults policy this codebase enforces.

**This is the design's one stringly-typed edge, and it is deliberate**: a typed control handle
would have to cross the same seam as the state type and would put DOM types in the step list.
The defence is §10's test — for every scene, every step's `focus` is asserted to be a member of
that panel's `controlIds`. A typo fails the suite. Without that test this design should not
ship.

## 8. What the seven scripts cover

Prose is the bulk of this work and is reviewed as carefully as the code. Each script is 5–9
steps; each step is one short paragraph naming one thing to look at or do. Steps must describe
**what to do and what will happen**, never assert what is currently on screen — controls stay
live, so the scene may not look how the step left it.

| Scene                   | The sequence, in brief                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Derivative & tangent    | The curve → drag the point, the tangent follows → shrink h, the secant rotates onto it → the derivative curve underneath → the corner of \|x\| → zoom until the curve is its tangent |
| Chain rule graph        | Three graphs in a corner → drag x, watch Δu appear → the shared Δu leg → Δy on the side wall and floor → shrink Δx → the three slopes multiply                                       |
| Matrix transformation   | The unit square → drag one basis vector → the determinant as signed area → flip the sign, the fill changes → the eigenvectors as the lines that do not turn → a preset              |
| Gradient descent        | The surface → drag the ball, the gradient arrow follows → the tangent plane → step the optimizer → compare SGD and Adam on the ravine → the Rosenbrock valley                        |
| Backprop graph          | Leaves are given → step the forward pass → the output → step the backward pass → local derivatives on the edges → the node that feeds two consumers accumulates                     |
| Neural network          | The untrained boundary → press Play → the boundary bends toward the data → drag the probe → the activations behind one prediction → switch to two moons                              |
| GPT transformer         | Words on the floor are embedding space → the pipeline on the wall → click a column, arcs fan back → `collapsed` isolates head 1's positional bias → the mask off → drag a word toward the final vector and watch its bar take over |

The transformer's script must not contradict its explanation panel, which already states three
true-but-misleading properties (§3.4, §3.7 and §10 of that scene's spec). Where a step touches
one, it says the same thing.

## 9. Files

New:

```
src/viz/shared/walkthrough.ts        Step<S>, createWalkthrough, replay
src/app/walkthrough.ts               banner, step card, Back/Next/Exit, keyboard
src/viz/<id>/walkthrough.ts          × 7, one per scene: the steps
```

Changed:

```
src/viz/types.ts                     StepView, WalkthroughInstance, VizInstance.walkthrough
src/app/router.ts                    the four-segment form, clamping, redirects
src/app/viz-page.ts                  mount the chrome when a walkthrough exists; URL sync
src/viz/<id>/panel.ts                × 7, control ids + focus(id)
src/viz/<id>/index.ts                × 7, wire createWalkthrough into mount
styles/panel.css                     .is-focused, the banner and the step card
README.md, docs/roadmap.md           walkthrough mode moves from in-flight to live
```

## 10. Tests

**`viz/shared/walkthrough.test.ts`** — `goTo(i)` equals folding `enter` over `initial()`;
`goTo` is idempotent; `goTo(2)` after `goTo(5)` equals `goTo(2)` from fresh; `exit()` restores
`initial()`; out-of-range indices throw; a zero-step walkthrough is rejected at construction.

**`app/router.test.ts`** — the four-segment form parses to the right 0-based `step`; `n = 0`,
negative, non-numeric and non-`walkthrough` third segments each redirect; an `n` past the end
clamps and rewrites; a scene with no walkthrough redirects to the plain scene; existing one- and
two-segment routes are unchanged.

**`app/walkthrough.test.ts`** — the banner shows `index + 1` of `total`; Next on the last step
reads Finish and exits; Back on the first step is disabled; Exit clears the chrome; `→`/`←`/`Esc`
work and are ignored while focus is in a form control; the card is scrolled into view on advance.

**Per scene, `viz/<id>/walkthrough.test.ts`** — the four that matter, run over every step of
every scene:

1. **Every `focus` id is in that panel's `controlIds`** (criterion §1.3). This is the test the
   design depends on.
2. Every `enter` is pure — the input state is not mutated, and applying twice equals once.
3. Every step's prose is non-empty and does not assert what is on screen (no "you can see",
   "notice that the … is" phrasing) — steps must survive a viewer having moved something.
4. Replay determinism: `goTo(i)` from fresh equals `goTo(i)` reached by Next `i` times.

**Regression** — the six scenes' existing test files must pass untouched, proving
`VizInstance.walkthrough` is genuinely optional.

## 11. Risks

| Risk                                                                                              | Mitigation                                                                                                                                       |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `focus` is a string, the exact coupling class this codebase has removed eight instances of        | §10.1 asserts every id against the panel's registry, per scene; an unknown id throws at runtime rather than no-opping                             |
| Replay discards a viewer's own exploration on advance                                             | Intended and stated in §4; the alternative (preserving changes) makes a step's prose unable to describe its own scene                             |
| Seven scripts of prose is the bulk of the work and the easiest place to be glib                   | Prose is reviewed as carefully as the math, §8 fixes what each covers, and §10.3 mechanically rejects "look at the screen" phrasing               |
| Touching seven panels to add control ids risks regressing scenes that are shipped and working     | Panels gain members, no existing call site changes; the six scenes' existing tests must pass untouched (§10 Regression)                           |
| A stale deep link after a script is edited                                                        | Clamp to the last step and rewrite the hash rather than 404 or blank                                                                              |
| Steps that set state the scene's own controls then contradict                                     | `enter` is built only from exported setters, so a step cannot reach past the control surface; §10.2 pins purity                                   |
| The step card sits low in a long panel and a viewer loses it                                      | The panel scrolls it into view on each advance (§5); validated in the browser, not asserted from arithmetic                                       |

## 12. Build order

Shell first, then the two scenes that stress it from opposite ends, then the rest:

1. `shared/walkthrough.ts` + `types.ts` + router + `app/walkthrough.ts` + panel focus for one scene.
2. **GPT transformer** — the most step-hungry scene, eight control clusters, built for this.
3. **Gradient descent** — the oldest and simplest, and the proof the shell is not accidentally
   shaped around the newest scene.
4. The remaining five, one task each, once the abstraction has survived both.

Browser validation before merge, per the standing instruction: every scene's walkthrough walked
end to end in both themes, plus a deep link loaded cold.
