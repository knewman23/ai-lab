import { formatLr } from "../core/math/optimizers";

/** Native range steps, mapped log-uniformly onto [min, max]. */
const STEPS = 1000;

function stepFor(value: number, min: number, max: number): number {
  return Math.round((Math.log(value / min) / Math.log(max / min)) * STEPS);
}

function valueFor(step: number, min: number, max: number): number {
  return min * Math.pow(max / min, step / STEPS);
}

export interface LogSliderOptions {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}

export interface LogSlider {
  el: HTMLElement;
  get value(): number;
  set value(v: number);
}

let nextId = 0;

/**
 * A `<input type="range">` mapped log-uniformly onto [min, max], with a
 * visible `<output>`. Interactive input fires `onChange`; setting `.value`
 * programmatically updates the control without firing it.
 */
export function createLogSlider(opts: LogSliderOptions): LogSlider {
  const { min, max, onChange } = opts;
  const format = opts.format ?? formatLr;
  const id = `log-slider-${++nextId}`;
  let current = opts.value;

  const wrap = document.createElement("div");
  wrap.className = "field";

  const labelEl = document.createElement("label");
  labelEl.className = "lbl";
  labelEl.htmlFor = id;
  labelEl.textContent = opts.label;

  const row = document.createElement("div");
  row.className = "field-row";

  const range = document.createElement("input");
  range.type = "range";
  range.id = id;
  range.min = "0";
  range.max = String(STEPS);
  range.step = "1";

  const out = document.createElement("output");
  out.htmlFor = id;

  row.append(range, out);
  wrap.append(labelEl, row);

  function render(): void {
    range.value = String(stepFor(current, min, max));
    out.textContent = format(current);
  }
  render();

  range.addEventListener("input", () => {
    current = valueFor(Number(range.value), min, max);
    out.textContent = format(current);
    onChange(current);
  });

  return {
    el: wrap,
    get value() {
      return current;
    },
    set value(v: number) {
      current = v;
      render();
    },
  };
}
