/**
 * All of the scene's user-facing copy, and the renderer for the panel's share of it: the five §7
 * topics and the block's three rules, the per-preset hints under the embeddings select, and the
 * caveats `panel-readouts.ts` prints under the numbers. Written down together because they make
 * one argument and have to agree — the `tuned` hint once blamed head 2 for a row head 1 computes
 * alone, while the paragraph below it had the mechanism right.
 *
 * Copy only. Nothing here computes anything the scene draws; it quotes `BLEND`, which
 * `arcs-geometry.ts` derives and sizes the ribbons from, so the prose cannot name a coefficient
 * the model no longer has.
 *
 * Three things this scene shows are true, visible and misleading if left unsaid — head 1 is not
 * the previous-token head its rotation suggests (§3.4), the block predicts the token it just read
 * (§3.7), and a tied unembedding rewards distance in one direction and punishes it in the other
 * (§10) — so the copy is written with the same care as the math, and the five topics §7 lists
 * appear in the order it lists them.
 */

import { W_O, W_V } from "../../core/math/transformer";
import { createEquation } from "../../ui/equation";
import { fmt } from "../../ui/readout";
import { BLEND } from "./arcs-geometry";
import type { PresetKey } from "./state";
import type { OverviewSpec } from "../../ui/overview";
import type { ControlInfo } from "../../ui/info";

/** One entry per control, in the panel's order: what it changes, and what to watch. */
export const CONTROL_INFO = {
  sentence: {
    what: "Swaps which five tokens run through the block. The embeddings carry across unchanged.",
    why:
      "The embeddings are this scene's independent variable, so changing the sentence while " +
      "keeping them shows how much of the result is the words and how much is their order. The " +
      "scrambled option is the same words in an order that means nothing.",
  },
  preset: {
    what: "Replaces all eight word positions on the floor at once, discarding any dragging.",
    why:
      "Each preset is a lesson. Tuned spaces the parts of speech far enough apart that content " +
      "beats position inside head 1. Collapsed puts every word on one point, stripping the " +
      "content out so head 1's positional bias shows alone. Spread pushes them far apart, which " +
      "makes weight tying visible in the bars.",
  },
  query: {
    what:
      "Chooses which position is doing the reading. The arcs fan back from that column to the " +
      "tokens it attends to, and the readouts follow it.",
    why:
      "Attention is one row per position, and this picks the row. Position 0 can only read " +
      "itself, so its weight is exactly 1 with no range to compare. The logits always come from " +
      "the last position's final vector, whichever query the arcs are drawing.",
  },
  head: {
    what: "Chooses whose attention row the arcs are sized from: head 1, head 2, or a blend of both.",
    why:
      "The two heads lean different ways. Head 1's query is rotated back one radian, which points " +
      "it at the previous position; head 2 compares content directly. Under both, the arc width " +
      "is a display blend weighted by each head's real contribution, which the readout spells out.",
  },
  stage: {
    what:
      "Focuses one stage of the block: it dims the other bands on the wall and prints that " +
      "stage's own numbers in the readout.",
    why:
      "It is how the pipeline is read one step at a time, from embed and position at the bottom " +
      "up to the logits at the top. Three of the entries — scores, softmax and the weighted sum — " +
      "all happen on the attention band, so they light the same band and change only the numbers.",
  },
  temperature: {
    what: "Divides the logits before the softmax that turns them into probabilities.",
    why:
      "It changes only the last step, never the block: the logits underneath are untouched, and " +
      "the ordering of the words never changes. Low temperature concentrates the mass on the top " +
      "word, high temperature flattens the distribution towards uniform.",
  },
  positional: {
    what: "Adds each token's position encoding to its embedding, or leaves it out.",
    why:
      "Without it the block has no idea what order the words came in — the two instances of the " +
      "same word become identical, and attention cannot tell them apart. Turning it off is the " +
      "cleanest demonstration that attention alone is order-blind.",
  },
  causal: {
    what: "Masks the keys after the query, so a position can only read itself and what came before.",
    why:
      "This is what makes the model a next-word predictor rather than a reader of the whole " +
      "sentence: without it, a position sees the future it is meant to be predicting. Turn it off " +
      "and the arcs reach forward as well as back.",
  },
  residualPath: {
    what:
      "Draws the selected token's journey on the floor: the embedding, plus each edit the block " +
      "adds to it.",
    why:
      "A block edits vectors rather than replacing them. The chain of arrows is that running " +
      "total — attention's contribution, then the MLP's — and it shows how far the final vector " +
      "actually travels from the one that entered.",
  },
} as const satisfies Readonly<Record<string, ControlInfo>>;

export const OVERVIEW: OverviewSpec = {
  summary: "How a language model decides which word comes next",
  objective:
    "A transformer block lets every position read the others and edit its own vector by what it " +
    "finds. Stack enough blocks and the running total at the last position is a summary of " +
    "everything before it, which a final step turns back into a score for each word.",
  whereUsed:
    "Every current large language model, along with machine translation and the code completion " +
    "in an editor. The same architecture reads images for self-driving perception, and amino " +
    "acid sequences for protein structure prediction.",
  example:
    "Autocomplete while you type: the model reads the tokens so far, attention lets the cursor's " +
    "position look back at a function name twenty lines up, and the output is a ranked list of " +
    "next tokens. This scene is one block with two dimensions per vector instead of thousands, " +
    "which is the only reason the arcs and the vectors can be drawn at all.",
};

/**
 * What a block does, in three lines: attention edits the stream, the MLP edits it again, and the
 * tied unembedding turns the result back into a word. None depends on the state.
 */
const EQUATION_TEX: readonly string[] = [
  "x' = x + \\mathrm{Attn}(x)",
  "x'' = x' + \\mathrm{MLP}(x')",
  "\\mathrm{logit}_v = x''_{\\mathrm{last}} \\cdot e_v",
];

/**
 * One line under the embeddings select for each preset. The presets are the scene's lessons and
 * a viewer will not read the spec, so `collapsed` states the §1.3 link in the interface itself.
 */
export const PRESET_HINTS: Readonly<Record<PresetKey, string>> = {
  tuned:
    "Parts of speech grouped, far enough apart that content wins inside head 1: its own " +
    "embedding cross-terms outcompete its own positional term, which is why head 1's strongest " +
    "key is not the preceding token.",
  collapsed:
    "No information in the embeddings — switch here to see head 1's positional bias on its own.",
  spread:
    "Eight far-apart points. Because the unembedding is tied, a logit is direction times " +
    "distance: pushing a word further out raises its bar only on the side the final vector " +
    "points to, and drives it down on the other.",
};

const PARAGRAPHS: readonly string[] = [
  // 1. What a block does.
  "A block edits vectors, it does not replace them. Each token arrives as a point in embedding " +
    "space; attention adds a weighted read of the other tokens, the MLP adds a nonlinear " +
    "correction, and both are added to what was already there. That running total is the " +
    "residual stream, and the vector leaving the block is the one that entered it plus two edits.",

  // 2. Why d_model = 2, and what it costs (§3.4).
  "Every vector here has two components, which is the only reason you can see it. The cost is " +
    "that position and content have to share those two dimensions. Head 1's query rotation is " +
    "exact — R(−1) turns pe(p) into pe(p−1), so its query points straight at the previous " +
    "position's key — but the same rotation also mixes the token's content, and with the tuned " +
    "embeddings those content terms win: head 1's strongest key is not the preceding token. So " +
    "head 1 is previous-position biased, not a previous-token head. Switch the embeddings to " +
    "collapsed, which strips the content out, and the bias shows up on its own: the row peaks at " +
    "the immediately preceding position. Real models are wide enough to give position and content " +
    "nearly separate subspaces, which is how a genuine previous-token head can exist at all.",

  // 3. What the two heads lean toward.
  "Head 1 leans positional: its query is rotated back one radian, its keys and values are left " +
    "alone. Head 2 leans content: query and key are both the identity, so its score is the plain " +
    `dot product of two tokens' vectors, and its values are scaled by ${fmt(W_V[1][0])} on the ` +
    `way out. W_O then mixes the two, ${fmt(W_O[0])} of head 1 to ${fmt(W_O[2])} of head 2.`,

  // 4. Why layer norm is absent (§3.6).
  "There is no layer norm here. Normalising a two-component vector to zero mean and unit " +
    "variance leaves only ±(1, −1): every token would collapse onto one of two points and there " +
    "would be nothing left to watch. In a real block it rescales each token's vector to a fixed " +
    "length before attention and again before the MLP, which keeps activations in range as depth " +
    "grows. Its absence is a simplification this scene owns, not an error.",

  // 5. No training, and where to find it.
  "Nothing here is trained. The attention and MLP weights are hand-authored constants; the " +
    "embeddings are the only thing you can change. It shows: by default the block predicts the — " +
    "the token it just read — at 0.79. That is what an untrained block with a tied unembedding " +
    "does, because its final vector never travels far from the last token's own vector, and a " +
    "trained W_O and MLP are precisely what break that self-prediction. For weights that actually " +
    "move under gradient descent, see the neural network scene.",

  // The §10 property the payoff depends on.
  "Because the unembedding is the embedding matrix transposed, a word's logit is the dot product " +
    "of its point with the last token's final vector — direction times length, and the direction " +
    "half never drops out. So a bar also grows when its word is dragged further from the origin " +
    "on the same side as the final vector, not only when it is dragged toward that vector; drag " +
    "it further out the opposite way and the logit goes more negative and the bar shrinks. That " +
    "is a real property of weight tying rather than a quirk of this scene, and the spread preset " +
    "is there to make it visible.",
];

/** Position 0 reads only itself, so its row has no range to compare and its arc is full width. */
export const SINGLE_KEY =
  "Position 0 can only read itself: one key, so the weight is exactly 1 and there is no score " +
  "range to compare. Its arc draws at full width.";

/** §5.4 does not define a combined raw score, and the two heads' logits are not commensurable. */
export const SCORE_BLEND =
  "With both heads shown, arc thickness is a display blend of the two score landscapes, " +
  "normalised for drawing. The heads have different W_Q and W_K, so their raw scores are not " +
  "comparable and the blend is not a model quantity — the per-head rows above are.";

/** Writing the blend as `0.6 a¹ + 0.4 a²` would be wrong: head 2's `W_V` shrinks its values first. */
export const WEIGHT_BLEND =
  `The blend weights each head by its real contribution to attnOut: ${fmt(BLEND.head1)} for head 1 ` +
  `and ${fmt(BLEND.head2)} for head 2 (W_O's ${fmt(W_O[2])} times head 2's W_V = ${fmt(W_V[1][0])} I). ` +
  `It sums to ${fmt(BLEND.head1 + BLEND.head2)}, not 1: a contribution, not a distribution.`;

export const PROJECTION = `W_O then mixes the heads: attnOut = ${fmt(W_O[0])} o¹ + ${fmt(W_O[2])} o².`;

export const LAST_POSITION =
  "The logits always come from the last position's final vector, whichever query the arcs draw.";

/**
 * Appends the block's three rules and the §7 prose to `host`, and returns the
 * element holding them so the caller can mark it. Nothing here depends on the state.
 */
export function createGptExplanation(host: HTMLElement): HTMLElement {
  const el = document.createElement("div");
  el.className = "explain";
  host.append(el);

  for (const tex of EQUATION_TEX) {
    const equation = createEquation();
    equation.set(tex);
    el.append(equation.el);
  }

  for (const text of PARAGRAPHS) {
    const p = document.createElement("p");
    p.textContent = text;
    el.append(p);
  }

  return el;
}
