import { TOPICS, type LazyVisualization, type RegistryEntry, type TopicSlug } from "../viz/types";
import { findEntry } from "./registry";

export type Route =
  | { readonly kind: "home"; readonly topic?: TopicSlug }
  | { readonly kind: "viz"; readonly topic: string; readonly id: string };

export type ResolvedRoute =
  | { readonly kind: "home"; readonly topic?: TopicSlug }
  | { readonly kind: "viz"; readonly entry: LazyVisualization }
  | { readonly kind: "redirect" };

function decodeSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
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
  if (segments.length !== 2) {
    return { kind: "home" };
  }

  const [rawTopic, rawId] = segments;
  const topic = decodeSegment(rawTopic!);
  const id = decodeSegment(rawId!);
  if (topic === undefined || id === undefined) {
    return { kind: "home" };
  }

  return { kind: "viz", topic, id };
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
    return { kind: "redirect" };
  }

  return { kind: "viz", entry };
}

export interface RouterDeps {
  readonly getHash: () => string;
  readonly setHash: (hash: string) => void;
  readonly addListener: (callback: () => void) => () => void;
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
 * On an unknown or "soon" hash, `start()` sets the hash to "#/"; the home
 * render happens on the resulting hashchange, not synchronously.
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
    const resolved = resolveRoute(route, find);
    if (resolved.kind === "redirect") {
      deps.setHash("#/");
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
