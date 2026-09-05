import { TOPICS, type LazyVisualization, type RegistryEntry, type TopicSlug } from "../viz/types";
import { findEntry } from "./registry";

export type Route =
  | { readonly kind: "home"; readonly topic?: TopicSlug }
  | {
      readonly kind: "viz";
      readonly topic: string;
      readonly id: string;
      /** 0-based step index of a walkthrough deep link; absent for the sandbox. */
      readonly step?: number;
    };

export type ResolvedRoute =
  | { readonly kind: "home"; readonly topic?: TopicSlug }
  | { readonly kind: "viz"; readonly entry: LazyVisualization; readonly step?: number }
  /** Carries where to go: "redirect to the plain scene" is otherwise unrepresentable. */
  | { readonly kind: "redirect"; readonly hash: string };

function decodeSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

const WALKTHROUGH_SEGMENT = "walkthrough";

/** The 0-based index a 1-based URL segment names, or undefined if it names none. */
function stepIndex(segment: string): number | undefined {
  if (!/^\d+$/.test(segment)) {
    return undefined;
  }
  const n = Number(segment);
  return n >= 1 ? n - 1 : undefined;
}

export function parseHash(hash: string): Route {
  const withoutHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const trimmed = withoutHash.replace(/^\/+/, "").replace(/\/+$/, "");
  if (trimmed === "") {
    return { kind: "home" };
  }

  const segments = trimmed.split("/");
  if (segments.length === 1) {
    // `#/<topic>` is the home page scrolled to that topic; anything else is plain home.
    const topic = decodeSegment(segments[0]!);
    const known = TOPICS.find((t) => t.slug === topic);
    return known ? { kind: "home", topic: known.slug } : { kind: "home" };
  }
  const isWalkthrough = segments.length === 4 && segments[2] === WALKTHROUGH_SEGMENT;
  if (segments.length !== 2 && !isWalkthrough) {
    return { kind: "home" };
  }

  const [rawTopic, rawId] = segments;
  const topic = decodeSegment(rawTopic!);
  const id = decodeSegment(rawId!);
  if (topic === undefined || id === undefined) {
    return { kind: "home" };
  }

  if (!isWalkthrough) {
    return { kind: "viz", topic, id };
  }

  // The `n` in the URL is 1-based. Anything that is not a whole step number —
  // 0, a negative, a fraction, a word — is the plain scene rather than a 404,
  // since the scene itself is what the visitor asked for.
  const step = stepIndex(segments[3]!);
  return step === undefined ? { kind: "viz", topic, id } : { kind: "viz", topic, id, step };
}

export function resolveRoute(
  route: Route,
  find: (topic: string, id: string) => RegistryEntry | undefined,
): ResolvedRoute {
  if (route.kind === "home") {
    return route.topic ? { kind: "home", topic: route.topic } : { kind: "home" };
  }

  const entry = find(route.topic, route.id);
  if (entry === undefined || entry.status === "soon") {
    return { kind: "redirect", hash: "#/" };
  }

  return route.step === undefined
    ? { kind: "viz", entry }
    : { kind: "viz", entry, step: route.step };
}

export interface RouterDeps {
  readonly getHash: () => string;
  readonly setHash: (hash: string) => void;
  readonly addListener: (callback: () => void) => () => void;
  /** Seam for tests: the router navigates to whatever target this hands back. */
  readonly resolve?: (
    route: Route,
    find: (topic: string, id: string) => RegistryEntry | undefined,
  ) => ResolvedRoute;
}

const defaultDeps: RouterDeps = {
  getHash: () => location.hash,
  setHash: (hash: string) => {
    location.hash = hash;
  },
  addListener: (callback: () => void) => {
    window.addEventListener("hashchange", callback);
    return () => {
      window.removeEventListener("hashchange", callback);
    };
  },
};

/**
 * On an unknown or "soon" hash, `start()` sets the hash to the redirect's
 * target ("#/" for every case the router itself decides); the home render
 * happens on the resulting hashchange, not synchronously.
 */
export function createRouter(
  onChange: (route: ResolvedRoute) => void,
  find: (topic: string, id: string) => RegistryEntry | undefined = findEntry,
  deps: RouterDeps = defaultDeps,
): { start(): void; stop(): void } {
  let started = false;
  let removeListener: (() => void) | undefined;

  const handleChange = (): void => {
    const route = parseHash(deps.getHash());
    const resolved = (deps.resolve ?? resolveRoute)(route, find);
    if (resolved.kind === "redirect") {
      deps.setHash(resolved.hash);
      return;
    }
    onChange(resolved);
  };

  return {
    start(): void {
      if (started) {
        return;
      }
      started = true;
      removeListener = deps.addListener(handleChange);
      handleChange();
    },
    stop(): void {
      removeListener?.();
      removeListener = undefined;
      started = false;
    },
  };
}
