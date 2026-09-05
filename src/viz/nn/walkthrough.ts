/**
 * The neural network scene's walkthrough: six steps built only from `state.ts`'s setters.
 *
 * **This scene's trap.** `epoch` advances on wall-clock time while `playing`, so a step that
 * turned Play on would be un-trained the moment the next step replayed from `initialState()` —
 * the boundary would snap back to epoch 0 mid-script. Every step here therefore calls
 * `trainEpoch` a fixed number of times inside `enter`, and none of them sets `playing`. Pressing
 * Play is something the prose invites; it is never something the script depends on.
 *
 * The prose says what to do and what will happen rather than what is on screen, because every
 * control stays live and the scene may not look how the step left it.
 */

import type { Step } from "../shared/walkthrough";
import type { NnControlId } from "./panel";
import { setDataset, setProbe, setShow, trainEpoch, type NnState } from "./state";

export const NN_WALKTHROUGH_TITLE = "Walk me through it";

/** Epochs each trained step runs. XOR separates well inside the first; moons needs the second. */
const XOR_EPOCHS = 60;
const MOONS_EPOCHS = 200;

/** Where the probe sits for the two steps that read it: inside one of XOR's positive clusters. */
const PROBE_AT: readonly [number, number] = [1.2, 1.2];

const train = (s: NnState, epochs: number): NnState => {
  let next = s;
  for (let i = 0; i < epochs; i += 1) next = trainEpoch(next);
  return next;
};

export const NN_STEPS: readonly Step<NnState, NnControlId>[] = [
  {
    prose:
      "Four clusters, two of each class, arranged so no straight line can separate them: that is " +
      "the XOR problem, and it is why this network has a hidden layer at all. The weights start " +
      "from a seed and know nothing, so the boundary drawn across the floor is arbitrary and the " +
      "accuracy is around what guessing would give.",
    enter: (s) => setDataset(s, "xor"),
    focus: "dataset",
  },
  {
    prose:
      "Press Step to run one epoch: a full-batch pass over every point, one gradient, one update " +
      "of every weight at the learning rate shown. Press Play to run them at ten a second, and " +
      "press it again to pause. The training line reports the epoch, the loss and the accuracy " +
      "after each one.",
    enter: (s) => setDataset(s, "xor"),
    focus: "step",
  },
  {
    prose:
      "Let it run to sixty epochs and the boundary bends until each cluster sits on its own side. " +
      "The loss falls by more than an order of magnitude on the way, and the accuracy reaches 1. " +
      "Nothing about the network's shape changed — only the numbers in the weights did.",
    enter: (s) => train(setDataset(s, "xor"), XOR_EPOCHS),
    focus: "play",
  },
  {
    prose:
      "Drag the probe anywhere across the floor. The readout is what the trained network answers " +
      "for that pair of coordinates, and it changes fastest as the probe crosses the boundary, " +
      "which is what a decision boundary is: the set of inputs the network is least sure about.",
    enter: (s) => setProbe(train(setDataset(s, "xor"), XOR_EPOCHS), PROBE_AT),
    focus: "reset",
  },
  {
    prose:
      "Turn the weights on to see the layers behind that one answer. Each column is a layer's " +
      "activations at the probe, and the links between them are the weights they are multiplied " +
      "by, so the output is the last number in a chain you can follow back to the two coordinates " +
      "you dragged.",
    enter: (s) =>
      setShow(setProbe(train(setDataset(s, "xor"), XOR_EPOCHS), PROBE_AT), "weights", true),
    focus: "showWeights",
  },
  {
    prose:
      "Switch to two moons, which cannot be split by any straight line either, and train it the " +
      "same way. It takes longer than XOR — a couple of hundred epochs rather than tens — and the " +
      "boundary it settles into is a curve rather than a cross, learned from the data by the same " +
      "update repeated.",
    enter: (s) => train(setDataset(s, "moons"), MOONS_EPOCHS),
    focus: "dataset",
  },
];
