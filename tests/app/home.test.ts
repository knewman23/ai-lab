// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHome } from "../../src/app/home";
import type { RegistryEntry, VizInstance } from "../../src/viz/types";

const noopInstance: VizInstance = {
  update: () => false,
  resize: () => undefined,
  dispose: () => undefined,
};

function ready(id: string, topic: RegistryEntry["topic"], title: string): RegistryEntry {
  return {
    id,
    topic,
    title,
    summary: `Summary of ${title}.`,
    status: "ready",
    mount: () => noopInstance,
  };
}

function soon(id: string, topic: RegistryEntry["topic"], title: string): RegistryEntry {
  return { id, topic, title, summary: `Summary of ${title}.`, status: "soon" };
}

function sections(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>("section.topic")];
}

function headings(el: HTMLElement): (string | null)[] {
  return sections(el).map((section) => section.querySelector("h2")?.textContent ?? null);
}

describe("renderHome", () => {
  it("renders one section per topic, in TOPICS order", () => {
    const el = renderHome([ready("a", "machine-learning", "A"), soon("b", "calculus", "B")]);
    expect(headings(el)).toEqual(["Calculus", "Linear Algebra", "Machine Learning"]);
  });

  it("renders a ready entry as a linked card", () => {
    const el = renderHome([ready("grad", "calculus", "Gradient descent")]);
    const card = el.querySelector<HTMLAnchorElement>("section.topic a.card");
    expect(card).not.toBeNull();
    expect(card!.getAttribute("href")).toBe("#/calculus/grad");
    expect(card!.hasAttribute("aria-disabled")).toBe(false);
    expect(card!.querySelector(".pill")?.textContent).toBe("Live");
    expect(card!.querySelector(".pill")?.classList.contains("p-live")).toBe(true);
    expect(card!.querySelector("h3")?.textContent).toBe("Gradient descent");
    expect(card!.querySelector("p")?.textContent).toBe("Summary of Gradient descent.");
    expect(card!.querySelector(".tags")?.textContent).toBe("Calculus");
    expect(card!.querySelector(".go")?.textContent).toBe("Open →");
  });

  it("renders a soon entry as a disabled non-link card", () => {
    const el = renderHome([soon("later", "calculus", "Later")]);
    const card = el.querySelector<HTMLElement>("section.topic .card");
    expect(card).not.toBeNull();
    expect(card!.tagName).toBe("DIV");
    expect(card!.hasAttribute("href")).toBe(false);
    expect(card!.getAttribute("aria-disabled")).toBe("true");
    expect(card!.querySelector(".pill")?.textContent).toBe("Soon");
    expect(card!.querySelector(".pill")?.classList.contains("p-soon")).toBe(true);
    expect(card!.querySelector(".go")).toBeNull();
  });

  it("shows an empty message for a topic with no entries", () => {
    const el = renderHome([ready("a", "calculus", "A")]);
    const [calculus, linear] = sections(el);
    expect(calculus!.querySelector(".empty")).toBeNull();
    expect(linear!.querySelector("p.empty")?.textContent).toBe(
      "Visualizations for this topic are coming.",
    );
    expect(linear!.querySelector(".card")).toBeNull();
  });

  it("numbers cards from 01 within each topic", () => {
    const el = renderHome([
      ready("a", "calculus", "A"),
      ready("b", "calculus", "B"),
      soon("c", "machine-learning", "C"),
    ]);
    const [calculus, , ml] = sections(el);
    expect([...calculus!.querySelectorAll(".cn")].map((n) => n.textContent)).toEqual(["01", "02"]);
    expect([...ml!.querySelectorAll(".cn")].map((n) => n.textContent)).toEqual(["01"]);
  });

  it("keeps registry order within a topic", () => {
    const el = renderHome([ready("b", "calculus", "Bee"), ready("a", "calculus", "Ay")]);
    const [calculus] = sections(el);
    expect([...calculus!.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["Bee", "Ay"]);
  });
});
