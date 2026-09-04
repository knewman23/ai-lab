import type { Graph, PassStep, Revealed, Values } from "../../core/math/autograd";
import { forward, gradsAfter, passSteps, revealed, starts } from "../../core/math/autograd";
import type { GraphKey } from "../../core/math/graphs";
import { GRAPHS } from "../../core/math/graphs";

/** Overlay toggles shown alongside the visualization. */
export type ShowKey = "values" | "grads" | "edgeDerivs";

/** Milliseconds between automatic steps while playing. */
export const STEP_MS = 700;

const DEFAULT_SHOW: Readonly<Record<ShowKey, boolean>> = {
  values: true,
  grads: true,
  edgeDerivs: true,
};

/** Backprop graph visualization state. `step` counts pass steps taken, 0..passSteps(graph).length. */
export interface BpState {
  readonly graph: GraphKey;
  readonly leaves: Values;
  readonly step: number;
  readonly playing: boolean;
  readonly show: Readonly<Record<ShowKey, boolean>>;
}

/** Everything the scene reads at the current state; see `derived`. */
export interface Derived {
  readonly graph: Graph;
  /** Every node's value at the current leaves (regardless of what is revealed yet). */
  readonly values: Values;
  readonly revealed: Revealed;
  /** Gradients after the backward steps taken so far; partial sums until every consumer has run. */
  readonly grads: Values;
  readonly steps: readonly PassStep[];
  /** The step just taken (`steps[step - 1]`), or null before the pass starts. */
  readonly current: PassStep | null;
  readonly done: boolean;
  readonly phase: "idle" | "forward" | "backward" | "done";
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function passLength(key: GraphKey): number {
  return passSteps(GRAPHS[key]).length;
}

export function initialState(): BpState {
  return {
    graph: "neuron",
    leaves: starts(GRAPHS.neuron),
    step: 0,
    playing: false,
    show: DEFAULT_SHOW,
  };
}

/** Switches graph; leaves go to the new graph's starts and the pass restarts. */
export function setGraph(s: BpState, key: GraphKey): BpState {
  return { ...s, graph: key, leaves: starts(GRAPHS[key]), step: 0, playing: false };
}

/** Sets one leaf, clamped to its range; unknown ids are ignored. The pass position is kept. */
export function setLeaf(s: BpState, id: string, v: number): BpState {
  const leaf = GRAPHS[s.graph].leaves.find((l) => l.id === id);
  if (!leaf) return s;
  return { ...s, leaves: { ...s.leaves, [id]: clamp(v, leaf.range[0], leaf.range[1]) } };
}

/** Advances one step; at the end of the pass the step stays put and playing stops. */
export function stepForward(s: BpState): BpState {
  const len = passLength(s.graph);
  const step = Math.min(len, s.step + 1);
  return { ...s, step, playing: s.playing && step < len };
}

export function resetPass(s: BpState): BpState {
  return { ...s, step: 0, playing: false };
}

/** Starts or stops autoplay; a no-op once the pass is done. */
export function setPlaying(s: BpState, on: boolean): BpState {
  if (s.step >= passLength(s.graph)) return s;
  return { ...s, playing: on };
}

export function setShow(s: BpState, key: ShowKey, on: boolean): BpState {
  return { ...s, show: { ...s.show, [key]: on } };
}

/** Returns the leaves to their starts and the pass to step 0; overlay toggles and graph are kept. */
export function reset(s: BpState): BpState {
  return { ...s, leaves: starts(GRAPHS[s.graph]), step: 0, playing: false };
}

/** Allocates new objects each call; call once per state change (e.g. per render), not in a hot loop. */
export function derived(s: BpState): Derived {
  const graph = GRAPHS[s.graph];
  const values = forward(graph, s.leaves);
  const rev = revealed(graph, s.step);
  const steps = passSteps(graph);
  const current = steps[s.step - 1] ?? null;
  const done = s.step >= steps.length;
  const phase: Derived["phase"] =
    current === null ? "idle" : done ? "done" : current.kind === "forward" ? "forward" : "backward";
  return {
    graph,
    values,
    revealed: rev,
    grads: gradsAfter(graph, values, rev.backwardSteps),
    steps,
    current,
    done,
    phase,
  };
}
