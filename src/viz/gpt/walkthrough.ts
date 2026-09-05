/**
 * The GPT scene's walkthrough: six steps built only from `state.ts`'s setters, so a step can
 * never reach past the control surface the panel itself offers.
 *
 * The prose says what to do and what will happen rather than what is on screen, because every
 * control stays live and the scene may not look how the step left it. Where a step touches one
 * of the three true-but-misleading properties this scene shows — head 1 is previous-position
 * biased rather than a previous-token head, the untrained block predicts the token it just read,
 * and a tied unembedding rewards distance in one direction only — it says what `explanation.ts`
 * says, since the two are read side by side.
 */

import type { Step } from "../shared/walkthrough";
import type { GptControlId } from "./panel";
import { setCausal, setHead, setPreset, setQuery, setStage, type GptState } from "./state";

export const GPT_WALKTHROUGH_TITLE = "Walk me through it";

/** The query used from step 3 on: a middle position, so the causal mask has something to hide. */
const MIDDLE_QUERY = 2;

export const GPT_STEPS: readonly Step<GptState, GptControlId>[] = [
  {
    prose:
      "The eight points on the floor are the whole vocabulary, and their positions are the only " +
      "thing about the words this model knows. Drag one and everything downstream answers. The " +
      "Embeddings select chooses where they start: tuned groups parts of speech and spaces them " +
      "far enough apart that content, not position, decides what head 1 reads.",
    enter: (s) => setStage(setPreset(s, "tuned"), "all"),
    focus: "preset",
  },
  {
    prose:
      "Each column on the wall is one token of the sentence, and the bands stacked above them " +
      "are what the block does to every column in turn: embed and position at the bottom, then " +
      "attention, the residual add, the MLP, and the logits at the top. Pick one from the Stage " +
      "select to dim the rest and print that stage's numbers below — attention holds three of " +
      "the entries, the raw scores, the softmax over them and the weighted sum, so those three " +
      "light the same band and change only what the readout prints.",
    enter: (s) => setStage(s, "embed"),
    focus: "stage",
  },
  {
    prose:
      "Pick which position does the reading, either from Query token or by clicking a column on " +
      "the wall. Ribbons fan back from that column to the tokens it reads, sized by how much of " +
      "its attention output each one contributes. With both heads shown that size is a blend of " +
      "the two, weighted by what each head really contributes through W_O.",
    enter: (s) => setQuery(setStage(setHead(s, "both"), "softmax"), MIDDLE_QUERY),
    focus: "query",
  },
  {
    prose:
      "Switch Embeddings to collapsed, which puts every word at the same point and strips the " +
      "content out. Head 1's query rotation turns pe(p) into pe(p−1) exactly, so with nothing " +
      "else left in the score its row peaks at the immediately preceding position. Switch back " +
      "to tuned and that peak moves: the content terms outweigh the positional one, which is " +
      "why head 1 is previous-position biased rather than a previous-token head.",
    enter: (s) => setStage(setHead(setPreset(s, "collapsed"), "head1"), "scores"),
    focus: "preset",
  },
  {
    prose:
      "Turn the causal mask off and the ribbons reach forward as well as back: this position may " +
      "then read the tokens after it, which is what a block does with nothing stopping it. The " +
      "mask is what keeps a position from reading the future it is supposed to predict. Nothing " +
      "here is trained, so this block's own prediction is the token it just read — the mask " +
      "governs what each position may look at, not what these weights have learned.",
    enter: (s) => setCausal(setStage(setHead(setPreset(s, "tuned"), "both"), "softmax"), false),
    focus: "causal",
  },
  {
    prose:
      "Switch Embeddings to spread, then drag a word further from the origin along the direction " +
      "the last token's final vector points. Because the unembedding is the embedding matrix " +
      "transposed, a word's logit is that vector dotted with its point — direction times length " +
      "— so its bar climbs as it goes out that way, and sinks if it is dragged out the opposite " +
      "way instead.",
    // The mask goes back on: the previous step took it off, and the logits this
    // step is about are the ones a masked block really produces.
    enter: (s) => setCausal(setQuery(setStage(setPreset(s, "spread"), "logits"), 4), true),
    focus: "preset",
  },
];
