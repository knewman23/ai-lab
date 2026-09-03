import type { RegistryEntry, Visualization } from "../viz/types";
import { findEntry } from "./registry";

export type Route =
  { readonly kind: "home" } | { readonly kind: "viz"; readonly topic: string; readonly id: string };

export type ResolvedRoute =
  | { readonly kind: "home" }
  | { readonly kind: "viz"; readonly entry: Visualization }
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
    return { kind: "home" };
  }

  const entry = find(route.topic, route.id);
  if (entry === undefined || entry.status === "soon") {
    return { kind: "redirect" };
  }

  return { kind: "viz", entry };
}

export function createRouter(
  onChange: (route: ResolvedRoute) => void,
  find: (topic: string, id: string) => RegistryEntry | undefined = findEntry,
): { start(): void; stop(): void } {
  const handleChange = (): void => {
    const route = parseHash(location.hash);
    const resolved = resolveRoute(route, find);
    if (resolved.kind === "redirect") {
      location.hash = "#/";
      return;
    }
    onChange(resolved);
  };

  return {
    start(): void {
      window.addEventListener("hashchange", handleChange);
      handleChange();
    },
    stop(): void {
      window.removeEventListener("hashchange", handleChange);
    },
  };
}
