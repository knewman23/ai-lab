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

export type RegistryEntry = Visualization | RoadmapEntry;

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
  accent: Color;
}

export interface VizHost {
  canvasContainer: HTMLElement; // the renderer's canvas is already attached here
  panel: HTMLElement; // controls + explanation go here
  renderer: Renderer; // shared, created once per page load, already init()ed
  theme: ThemeColors;
}

export interface VizInstance {
  update(dt: number): boolean; // called by the loop; the viz calls renderer.render itself
  // and returns true if it rendered. Loop idles after 1 s of false.
  resize(w: number, h: number): void; // shell has already called renderer.setSize
  dispose(): void; // must release all GPU resources and listeners
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
