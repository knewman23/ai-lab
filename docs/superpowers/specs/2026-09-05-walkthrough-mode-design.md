# Walkthrough mode — numbered steps that drive any scene, owned by the scene and framed by the shell

Date: 2026-09-05
Status: approved (revision 4; two review rounds, seven blocking issues found and closed — see §13)
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
3. A step cannot name a control that does not exist: `focus` is a per-scene union and the
   panel's registry is a `Record` over it, so an unregistered id fails to compile (§7).
4. Every step's `enter` is **deterministic over the scene's diffing surface**: two calls on the
   same input state produce equal results, and the input state's diffed fields are unchanged
   afterwards (asserted per scene). Note this is *not* idempotence — `enter(enter(s))` may
   legitimately differ from `enter(s)`, because a step that advances an optimizer or trains an
   epoch changes `pos`, `steps` and `optState` by design. Replay needs determinism; idempotence
   would forbid every stepping step in the gradient-descent and neural-network scripts.
5. Changing a control mid-step does not exit the walkthrough and does not change which step is
   showing.
6. A scene with no walkthrough behaves exactly as it does today — no banner, no chrome, no
   route — proving `VizInstance.walkthrough` is genuinely optional. All seven scenes' existing
   test files must keep passing untouched.
7. All seven live scenes ship a walkthrough.
8. The diffing surface is named per scene: `GdState.path` is documented as deliberately mutable
   and is excluded explicitly, not by accident (§4).

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
| Pointing           | The step names a control from that scene's own `ControlId` union; the panel outlines it in place                                                                        | Prose alone ("use the Head select"); an arrow drawn on the canvas                   |
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
}

export interface WalkthroughInstance {
  /** Names the start control, e.g. "Walk me through it". */
  readonly title: string;
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

`StepView` crosses the seam as plain data — note it carries **no `focus`**: applying the
outline is the scene's job (§7), because only the scene knows its own control ids. The shell
never sees a scene's state type, and a scene never sees the DOM chrome.

## 4. The step model (`src/viz/shared/walkthrough.ts`)

```ts
export interface Step<S, C extends string> {
  readonly prose: string;
  readonly enter: (state: S) => S;
  readonly focus?: C; // that scene's own ControlId union — not an open string
  readonly framing?: Framing;
}

export function createWalkthrough<S, C extends string>(opts: {
  readonly title: string;
  readonly steps: readonly Step<S, C>[];
  readonly initial: () => S;
  readonly apply: (state: S) => void;
  readonly focus: (id: C | undefined) => void;
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

`enter` must be pure and built from the scene's exported setters, and must not reach into the
scene's Three.js objects.

**`gradient-descent`'s `step` mutates, and that is deliberate — do not "fix" it.**
`state.ts:79` does `s.path.push(pos)` and returns the same buffer. Revision 2 of this spec
called that a defect and made a purity fix a prerequisite. That was wrong: the module documents
the choice at `state.ts:18-28` — *"`step` pushes onto the existing buffer, mutating it in place
by design, since path history is intentionally not part of the immutable diffing surface"* —
and a fix would copy a 2000-entry `RingBuffer` on every frame of a running optimizer, which is
exactly the cost that design avoids.

So the purity criterion is scoped rather than the code changed: **`enter` must be pure with
respect to the state's diffing surface**, which for `GdState` excludes `path` by that module's
own definition. §10's per-scene purity test compares every field except the documented mutable
ones, and names them.

Replay is unaffected, and this is worth stating because it is not obvious: `goTo(i)` folds from
`initial()`, which calls `freshPath(pos)` — a *new* buffer — and each `step` inside `enter`
pushes into that new buffer. After replaying `i` steps the path holds exactly the positions a
viewer would have produced by pressing Step `i` times. The mutation is confined to a buffer
created during the same fold and never touches another state object.

**That last sentence has a precondition, and it is a contract, not an observation:
`initial` must allocate on every call.** Nothing in the type `initial: () => S` forbids
`const s0 = initialState(); initial: () => s0`, and a scene author who memoized it that way
would have every fold push into one shared buffer — the trail would grow across `goTo` calls,
and Back would show a longer path than Next did. `createWalkthrough` documents the requirement,
and §10 pins it: two `goTo(i)` calls must give equal path contents *and* must not be the same
buffer instance.

A second scene needs care rather than a fix: `NnState.epoch` advances on wall-clock time while
`playing`. A "press Play" step followed by any advance replays from `initialState()` and snaps
the network back to epoch 0, un-training the boundary mid-script. The nn script must call
`trainEpoch` a fixed number of times inside `enter` rather than depend on Play having run.

## 5. Shell chrome (`src/app/walkthrough.ts`)

**Where the chrome mounts.** Scenes build their panels into `host.panel` themselves and
`ui/panel.ts` exposes only `el` and `section()`, so the shell has no way to address "the top of
the panel" or "the explanation's slot". Rather than give seven panels new slots, `viz-page.ts`
wraps the panel host in three regions and passes only the middle one to the scene:

```
<div class="panel-host">
  <div class="wt-banner">   ← shell owns
  <div class="wt-scene">    ← passed to the scene as host.panel; unchanged from today
  <div class="wt-step">     ← shell owns
</div>
```

The scene's panel code is untouched. While a walkthrough is active the wrapper carries
`.wt-active`, which collapses the scene panel's explanation section so the step card occupies
that visual position — panels mark that section by passing `{ role: "explanation" }` to
`section()`, the one small change `ui/panel.ts` needs.

Rendered by the viz page when `instance.walkthrough` exists, per §2's layout decision:

- **Banner**, a slim strip at the top of the panel: `WALKTHROUGH · 3/9` and an **Exit** control.
  Present only while a walkthrough is active.
- **Step card**, in the slot the explanation prose occupies, containing the step number, the
  prose, **Back** and **Next**. On the last step, Next reads **Finish** and exits.
- **Start control**, when no walkthrough is running: a single button in the banner region,
  labelled `walkthrough.title` (e.g. "Walk me through it"), absent on scenes with no
  walkthrough.
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

**The router parses; it cannot validate.** Clamping an out-of-range `n` and redirecting a
walkthrough-less scene both need `walkthrough.length`, which exists only after `mount()` —
`resolveRoute` sees registry metadata alone. So the work splits:

*Router (`parseHash`/`resolveRoute`, pure):*

- `Route` gains `{ kind: "viz"; topic; id; step?: number }`; `step` is the 0-based index, or
  absent for the sandbox.
- A non-numeric, zero or negative `n` → the same route without a `step` (the plain scene).
- Three segments, or a third segment other than `walkthrough` → home, as today.
- `ResolvedRoute`'s redirect arm gains a **target**: `{ kind: "redirect"; hash: string }`.
  `createRouter` currently hardcodes `deps.setHash("#/")` (`router.ts:99-101`), so "redirect to
  the plain scene" is unrepresentable until it does.

*Viz page (post-mount):*

- An `n` past the end clamps to the last step and rewrites the hash, so a stale link from an
  edited script lands on the last step rather than blank.
- A `step` on a scene whose instance has no `walkthrough` rewrites the hash to the plain scene.

**Every case, and who decides.** Ownership now differs per row, so it is tabulated rather than
described:

| Input hash                                  | Result                             | Decided by |
| ------------------------------------------- | ---------------------------------- | ---------- |
| `#/ml/gpt-transformer`                      | the scene, no step                 | router     |
| `#/ml/gpt-transformer/walkthrough/3`        | the scene at step index 2          | router     |
| `#/ml/gpt-transformer/walkthrough/0` or `/-1` or `/x` | the scene, no step       | router     |
| `#/ml/gpt-transformer/steps/3`              | `#/` (unknown route, as today)     | router     |
| `#/ml/unknown-scene/walkthrough/3`          | `#/` (unknown entry, as today)     | router     |
| any other unrecognised hash                 | `#/` — **this existing behaviour and its test must stay green** | router |
| `#/ml/gpt-transformer/walkthrough/99`       | rewritten to the last step         | viz page   |
| `#/calculus/derivative-tangent/walkthrough/2` where that scene ships no walkthrough | rewritten to the plain scene | viz page |

Advancing, going back, exiting and finishing all rewrite the hash with `replaceState` semantics
(no new history entry per step), so Back-button behaviour stays coherent: the browser's Back
leaves the scene rather than walking the steps backwards.

## 7. Control focus, and the string that has to be safe

A step names a control; the panel outlines it. **The id is a per-scene union, not an open
string**, so a typo is a compile error rather than something a test has to catch:

```ts
// src/viz/gpt/panel.ts
export type GptControlId = "sentence" | "preset" | "query" | "head" | "stage" | "temperature"
  | "positional" | "causal" | "residualPath" | "resetView";

readonly controls: Readonly<Record<GptControlId, HTMLElement>>; // exhaustive by construction
focus(id: GptControlId | undefined): void;                      // undefined clears
```

`Record<GptControlId, …>` makes the registry exhaustive: adding a union member without
registering its element fails to compile, and `Step<S, GptControlId>` rejects any id outside
the union. `focus` toggles a `.is-focused` class (a 2px `--accent` outline and a slight
background lift, defined once in `styles/panel.css`).

The ids are the scene's own vocabulary and are namespaced away from the DOM ids `ui/select.ts`
already mints internally (`select-1`, `select-2`, …); the two never meet.

**Revision 2 note.** The first draft made `focus` an open `string` defended by a test asserting
every id existed. A reviewer pointed out that this is precisely the coupling class this codebase
removed eight instances of during the transformer build, and that a union removes it instead of
testing around it. It also means `StepView` need not carry `focus` at all (§3) — the scene
applies its own outline.

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
src/app/router.ts                    the four-segment form; ResolvedRoute redirect gains a target
src/app/viz-page.ts                  the three panel regions; clamping and the walkthrough-less
                                     redirect (both need a length only mount() can supply); URL sync
src/ui/panel.ts                      section(title, { role: "explanation" }) so the wrapper can
                                     collapse that section while a walkthrough is active
src/viz/<id>/panel.ts                × 7, a ControlId union + Record registry + focus(id)
src/viz/<id>/index.ts                × 7, wire createWalkthrough into mount
styles/panel.css                     .is-focused, .wt-banner, .wt-step, .wt-active
README.md, docs/roadmap.md           walkthrough mode moves from in-flight to live
```

## 10. Tests

**`viz/shared/walkthrough.test.ts`** — `goTo(i)` equals folding `enter` over `initial()`;
`goTo` is idempotent; `goTo(2)` after `goTo(5)` equals `goTo(2)` from fresh; `exit()` restores
`initial()`; out-of-range indices throw; a zero-step walkthrough is rejected at construction.

**`app/router.test.ts`** — the four-segment form parses to the right 0-based `step`; `n = 0`,
negative, non-numeric and a non-`walkthrough` third segment each yield the plain scene or home;
`ResolvedRoute`'s redirect carries its target hash and `createRouter` navigates to it rather
than always `#/`; existing one- and two-segment routes parse unchanged. **Clamping and the
walkthrough-less redirect are not tested here** — they live in `viz-page.ts`, because the router
cannot know a length that only exists after `mount()`.

**`app/viz-page.test.ts`** — a `step` past the end clamps to the last and rewrites the hash; a
`step` on a scene whose instance exposes no `walkthrough` rewrites to the plain scene; the three
panel regions exist and the scene receives only the middle one; `.wt-active` collapses the
section registered with `role: "explanation"`.

**`app/walkthrough.test.ts`** — the banner shows `index + 1` of `total`; Next on the last step
reads Finish and exits; Back on the first step is disabled; Exit clears the chrome; `→`/`←`/`Esc`
work and are ignored while focus is in a form control; the card is scrolled into view on advance.

**Per scene, `viz/<id>/walkthrough.test.ts`** — run over every step of every scene:

1. Every `enter` is **deterministic** over the scene's diffing surface: call it twice on the
   same input state and compare the two results, then assert the input's diffed fields are
   unchanged afterwards. **Do not assert `enter(enter(s))` equals `enter(s)`** — that is
   idempotence, and it is false by design for any step that advances an optimizer or trains
   epochs. Assert against the *prior* state's captured fields rather than that a new object came
   back; the latter agrees with itself and passes on a mutating reducer. Each scene's test names
   the fields it excludes, and only `gradient-descent` excludes any (`path`, per
   `state.ts:18-28`).
2. **Every `focus` id resolves against a really-mounted panel's registry** — read
   `panel.controls` from an actual `createXPanel(...)` call, never a literal list re-stated in
   the test file. A duplicated list would agree with itself and prove nothing. The union already
   makes a typo a compile error; this catches a member declared but never registered.
3. A fixture pins the **value** of the state at two chosen steps (not just that two ways of
   reaching it agree). Given §4 folds from `initial()`, "goTo(i) fresh equals goTo(i) after i
   Nexts" is the same expression twice and can only fail if `enter` is impure — which item 1
   already covers. The fixture is what actually pins the script.
4. Prose is non-empty, and a lint rejects phrasing that asserts on-screen state ("you can see",
   "notice that"). **This is a lint, not the criterion** — it cannot catch "watch the boundary
   bend" — so §8's rule is enforced in review, and the lint only stops the obvious cases.

**`viz/shared/walkthrough.test.ts` also** — changing state between `goTo` calls does not change
`length` or the reported index (criterion §1.5); and **`initial` is called afresh for every
`goTo`**: two `goTo(i)` calls produce equal contents but not the same object identity for any
field the scene mutates in place, so a memoized `initial` fails here rather than silently
growing a shared buffer (§4).

**Regression** — all seven scenes' existing test files must pass untouched.

## 11. Risks

| Risk                                                                                              | Mitigation                                                                                                                                       |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~`focus` is an open string~~ — removed in revision 2: it is a per-scene union over a `Record` registry, so an unknown id fails to compile | §10.2 still checks a member declared but never registered, against a really-mounted panel      |
| `gradient-descent`'s `step` mutates its `path`, which reads as a purity violation               | It is a documented design decision (`state.ts:18-28`), not a defect; the criterion is scoped to the diffing surface and replay rebuilds the path correctly from a fresh buffer (§4) |
| A scene memoizes `initial`, so every fold pushes into one shared buffer and the trail grows across `goTo` calls | The contract is stated in §4 and pinned by a shared test asserting two `goTo(i)` calls are equal in content but distinct in identity |
| `nn`'s epoch advances on wall-clock time while playing, so replay un-trains the boundary        | Its script calls `trainEpoch` a fixed number of times inside `enter` rather than depending on Play (§4)                                          |
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

## 13. Revision log

**Revision 2 (2026-09-05)** — spec review found five blocking issues, all confirmed against the
code:

1. `gradient-descent/state.ts:79`'s `step` mutates its input (`s.path.push`), so replay could
   not reproduce that scene's script. Now a prerequisite fix (§4), not a workaround.
2. Clamping an out-of-range step and redirecting a walkthrough-less scene were assigned to the
   router, which cannot know a length that only exists after `mount()`. Split between router and
   viz page (§6).
3. `ResolvedRoute`'s redirect had no target and `createRouter` hardcodes `#/`, so "redirect to
   the plain scene" was unrepresentable (§6).
4. The chrome had no mount point: scenes build their own panels and `ui/panel.ts` exposes only
   `el` and `section()`. Solved with three regions in `viz-page.ts` rather than seven new panel
   slots (§5).
5. `WalkthroughInstance` had no `title`, though §5 labelled the start control with it (§3).

Non-blocking findings also applied: the `nn` wall-clock epoch problem (§4), §1.6's "six of
seven" contradicting §1.7, §10's replay test being an assertion that agrees with itself, the
registry test needing a really-mounted panel, the prose lint being framed as a lint rather than
the criterion, and the control-id namespace being distinct from `ui/select.ts`'s internal DOM
ids.

The reviewer's recommendation to type the control id was taken, which is a better outcome than
the original: it removes the coupling rather than testing around it, and lets `StepView` drop
its `focus` member entirely.

**Revision 3 (2026-09-05)** — corrects revision 2's first fix, and takes four advisory notes.

Revision 2 called `gradient-descent`'s mutating `step` a defect and made a purity fix a
prerequisite. Reading the module's own header showed that was wrong: the mutation is documented
and deliberate (`state.ts:18-28`), and the "fix" would have copied a 2000-entry `RingBuffer` on
every frame of a running optimizer — the exact cost the design was avoiding. The criterion is
now scoped to each scene's diffing surface instead, with excluded fields named per scene, and
§4 states why replay still rebuilds the path correctly. Both the reviewer and I mistook a
considered decision for a bug because the mutation was real; only the comment above it settled
what it meant.

Also applied: §10.1 now asserts the *prior* state's fields are unchanged rather than that a new
object came back (the latter agrees with itself); §6 gains a table naming every redirect case
and whether the router or the viz page decides it, including an explicit row for the existing
unknown-hash → `#/` behaviour that must stay green.

§5's layout wording was checked against fix 4 and stands: the step card sits below the scene
panel, and `.wt-active` collapses the section registered with `role: "explanation"`, so the two
paragraphs of prose do not both show.

**Revision 4 (2026-09-05)** — two blocking corrections from the second review round.

§1.4 and §10.1 asserted **idempotence** ("applying twice equals once"), which is false by design
for any step that advances an optimizer or trains an epoch: `enter(enter(s))` legitimately moves
`pos`, `steps` and `optState`, all inside the diffing surface, so no exclusion rescues it. The
gradient-descent and neural-network scripts would have failed the very test this spec told the
implementer to write. The property replay actually requires is **determinism** — two calls on
the same input state agree — and both places now say so.

§4's claim that the mutation "never escapes the fold" rested on an unstated precondition:
`initial` allocating fresh on every call. The type `() => S` permits a memoized constant, which
would make every fold share one buffer and grow the trail across `goTo` calls. That is now a
documented contract with a test that fails a memoized `initial` rather than letting it corrupt
quietly.

The reviewer confirmed the scoped-purity reading from revision 3.
