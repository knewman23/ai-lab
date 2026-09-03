import type { Mat2 } from "../../core/math/matrix2";
import { fmt } from "../../ui/readout";

const LABELS = ["a", "b", "c", "d"] as const;

export interface MatrixInputOptions {
  value: Mat2;
  onEntry: (i: 0 | 1 | 2 | 3, v: number) => void;
}

export interface MatrixInput {
  el: HTMLElement;
  set: (m: Mat2) => void;
}

/** A 2x2 grid of number inputs editing a `Mat2`, in [[a, b], [c, d]] order. */
export function createMatrixInput(opts: MatrixInputOptions): MatrixInput {
  const el = document.createElement("div");
  el.className = "matrix-input";

  let last = opts.value;
  const fields: HTMLInputElement[] = [];

  LABELS.forEach((label, i) => {
    const index = i as 0 | 1 | 2 | 3;
    const field = document.createElement("input");
    field.type = "number";
    field.step = "any";
    field.min = "-3";
    field.max = "3";
    field.setAttribute("aria-label", label);
    field.value = fmt(opts.value[index], 3);

    field.addEventListener("input", () => {
      const v = field.valueAsNumber;
      if (Number.isFinite(v)) {
        opts.onEntry(index, v);
      }
    });

    field.addEventListener("blur", () => {
      field.value = fmt(last[index], 3);
    });

    fields.push(field);
    el.append(field);
  });

  return {
    el,
    set(m: Mat2) {
      last = m;
      LABELS.forEach((_, i) => {
        const field = fields[i];
        if (field) field.value = fmt(m[i] as number, 3);
      });
    },
  };
}
