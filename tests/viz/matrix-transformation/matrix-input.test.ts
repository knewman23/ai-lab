// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createMatrixInput } from "../../../src/viz/matrix-transformation/matrix-input";
import type { Mat2 } from "../../../src/core/math/matrix2";

function inputs(el: HTMLElement): HTMLInputElement[] {
  return [...el.querySelectorAll("input")];
}

function inputAt(el: HTMLElement, i: number): HTMLInputElement {
  const input = inputs(el)[i];
  if (!input) throw new Error(`no input at index ${i}`);
  return input;
}

describe("createMatrixInput", () => {
  it("renders four number inputs with aria-labels a, b, c, d and step=any", () => {
    const value: Mat2 = [1, 0, 0, 1];
    const { el } = createMatrixInput({ value, onEntry: () => {} });
    const els = inputs(el);
    expect(els).toHaveLength(4);
    expect(els.map((i) => i.getAttribute("aria-label"))).toEqual(["a", "b", "c", "d"]);
    for (const i of els) {
      expect(i.type).toBe("number");
      expect(i.step).toBe("any");
    }
  });

  it("gives each input a unique id and a matching name, unique across instances", () => {
    const value: Mat2 = [1, 0, 0, 1];
    const { el: el1 } = createMatrixInput({ value, onEntry: () => {} });
    const { el: el2 } = createMatrixInput({ value, onEntry: () => {} });

    const ids1 = inputs(el1).map((i) => i.id);
    const ids2 = inputs(el2).map((i) => i.id);
    const names1 = inputs(el1).map((i) => i.name);

    expect(ids1.every((id) => id.length > 0)).toBe(true);
    expect(new Set([...ids1, ...ids2]).size).toBe(8);
    expect(names1).toEqual(["a", "b", "c", "d"]);
  });

  it("dispatches onEntry with the parsed index and value on input", () => {
    const onEntry = vi.fn();
    const value: Mat2 = [1, 0, 0, 1];
    const { el } = createMatrixInput({ value, onEntry });
    const b = inputAt(el, 1);
    b.value = "1.5";
    b.dispatchEvent(new Event("input"));
    expect(onEntry).toHaveBeenCalledWith(1, 1.5);
  });

  it("does not dispatch for a non-finite parse and leaves the DOM's value untouched", () => {
    // jsdom (matching the HTML spec's value sanitization for type=number)
    // reduces an invalid string like "-" to "" as soon as it's assigned,
    // before our input handler runs. So the observable contract we can test
    // here is: we don't fight that by force-resetting the field ourselves.
    const onEntry = vi.fn();
    const value: Mat2 = [1, 0, 0, 1];
    const { el } = createMatrixInput({ value, onEntry });
    const b = inputAt(el, 1);
    b.value = "-";
    b.dispatchEvent(new Event("input"));
    expect(onEntry).not.toHaveBeenCalled();
    expect(b.value).toBe("");
  });

  it("rewrites the field from the last set value on blur", () => {
    const onEntry = vi.fn();
    const value: Mat2 = [1, 0, 0, 1];
    const { el, set } = createMatrixInput({ value, onEntry });
    const b = inputAt(el, 1);
    b.value = "-";
    b.dispatchEvent(new Event("input"));
    set([1, 2, 0, 1]);
    b.dispatchEvent(new Event("blur"));
    expect(b.value).toBe("2");
  });

  it("set() writes fmt(v, 3) into each field without dispatching", () => {
    const onEntry = vi.fn();
    const value: Mat2 = [1, 0, 0, 1];
    const { el, set } = createMatrixInput({ value, onEntry });
    set([1, Math.SQRT1_2, 0, 1]);
    expect(inputAt(el, 1).value).toBe("0.707");
    expect(onEntry).not.toHaveBeenCalled();
  });
});
