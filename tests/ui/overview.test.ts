// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createOverview, type OverviewSpec } from "../../src/ui/overview";

const SPEC: OverviewSpec = {
  summary: "Finding the numbers that make a model wrong as rarely as possible",
  objective: "Fitting a model means choosing its weights so that its mistakes are small.",
  whereUsed: "Almost everything that is trained rather than programmed is trained this way.",
  example: "The textbook case is house prices, with a weight for each attribute.",
};

describe("createOverview", () => {
  it("starts closed, so the scene's controls are what a visitor lands on", () => {
    const overview = createOverview(SPEC);
    expect(overview.el instanceof HTMLDetailsElement).toBe(true);
    expect((overview.el as HTMLDetailsElement).open).toBe(false);
  });

  it("keeps its content for the visitor who opens it", () => {
    const el = createOverview(SPEC).el as HTMLDetailsElement;
    el.open = true;
    expect(el.textContent).toContain(SPEC.objective);
    expect(el.textContent).toContain(SPEC.whereUsed);
    expect(el.textContent).toContain(SPEC.example);
  });

  it("shows the summary line in the part that stays visible when closed", () => {
    const overview = createOverview(SPEC);
    const summary = overview.el.querySelector("summary");
    expect(summary?.textContent).toContain(SPEC.summary);
  });

  it("carries all three sections, each under its own heading", () => {
    const overview = createOverview(SPEC);
    const headings = [...overview.el.querySelectorAll("h4")].map((h) => h.textContent);
    expect(headings).toEqual(["What it's for", "Where it's used", "The picture to hold"]);

    const text = overview.el.textContent ?? "";
    expect(text).toContain(SPEC.objective);
    expect(text).toContain(SPEC.whereUsed);
    expect(text).toContain(SPEC.example);
  });

  it("collapses without losing its content, and can be opened again", () => {
    const overview = createOverview(SPEC);
    (overview.el as HTMLDetailsElement).open = true;
    overview.collapse();

    const el = overview.el as HTMLDetailsElement;
    expect(el.open).toBe(false);
    expect(el.textContent).toContain(SPEC.example);

    el.open = true;
    expect(el.open).toBe(true);
  });

  it("marks itself so the shell can find it without knowing the scene", () => {
    expect(createOverview(SPEC).el.dataset.role).toBe("overview");
  });
});
