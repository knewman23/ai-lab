import type { Color } from "three";

export type TopicSlug = "calculus" | "linear-algebra" | "machine-learning";

export interface RoadmapEntry {
  id: string; // "backprop-graph"
  topic: TopicSlug; // "machine-learning"
  title: string;
  summary: string; // one sentence for the card
  status: "soon";
}

export interface Visualization extends Omit<RoadmapEntry, "status"> {
  status: "ready";
  mount(host: VizHost): VizInstance;
}

/**
 * How the registry holds a ready visualization: card metadata plus a loader for
 * the chunk that owns the scene, so the home page never downloads Three.js.
 */
export interface LazyVisualization extends Omit<RoadmapEntry, "status"> {
  readonly status: "ready";
  readonly load: () => Promise<Visualization>;
}

export type RegistryEntry = LazyVisualization | RoadmapEntry;

/** The WebGPURenderer class from "three/webgpu"; it also backs the WebGL 2 fallback. */
export type Renderer = import("three/webgpu").WebGPURenderer;

export interface ThemeColors extends EventTarget {
  // dispatches "change" on toggle
  bg: Color;
  card: Color;
  sunken: Color;
  ink: Color;
  soft: Color;
  faint: Color;
  line: Color;
  line2: Color;
  accent: Color;
  warn: Color;
}

export interface VizHost {
  canvasContainer: HTMLElement; // the renderer's canvas is already attached here
  panel: HTMLElement; // controls + explanation go here
  renderer: Renderer; // shared, created once per page load, already init()ed
  theme: ThemeColors;
}

/** What the shell needs to draw one step's card: plain data, no scene state. */
export interface StepView {
  readonly index: number; // 0-based
  readonly total: number;
  readonly prose: string;
}

/**
 * The whole seam between a scene's walkthrough and the shell's chrome. The
 * shell never sees the scene's state type, and the scene never sees the DOM
 * chrome; note `StepView` carries no focus target, because applying the
 * outline is the scene's job — only it knows its own control ids.
 */
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
  update(dt: number): boolean; // called by the loop; the viz calls renderer.render itself
  // and returns true if it rendered. Loop idles after 1 s of false.
  resize(w: number, h: number): void; // shell has already called renderer.setSize
  dispose(): void; // must release all GPU resources and listeners
  /** Absent on a scene that ships no walkthrough. */
  readonly walkthrough?: WalkthroughInstance;
}

/** Ordered as in the spec's topic list. */
export const TOPICS = [
  { slug: "calculus", title: "Calculus" },
  { slug: "linear-algebra", title: "Linear Algebra" },
  { slug: "machine-learning", title: "Machine Learning" },
] as const satisfies ReadonlyArray<{ slug: TopicSlug; title: string }>;

export function topicTitle(slug: TopicSlug): string {
  return TOPICS.find((topic) => topic.slug === slug)!.title;
}
