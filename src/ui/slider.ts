import { formatLr } from "./readout";
import { fmt } from "./readout";
import { labelRow, type ControlInfo } from "./info";

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
  /** Adds the "what does this do?" button beside the label. */
  info?: ControlInfo;
}

export interface LogSlider {
  el: HTMLElement;
  get value(): number;
  set value(v: number);
}

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  /** Adds the "what does this do?" button beside the label. */
  info?: ControlInfo;
}

export interface Slider {
  el: HTMLElement;
  get value(): number;
  set value(v: number);
}

let nextId = 0;

interface RangeConfig {
  min: string;
  max: string;
  step: string;
  /** Maps a slider value to the native range input's raw string value. */
  toRange: (value: number) => string;
  /** Maps the native range input's raw string value back to a slider value. */
  fromRange: (raw: string) => number;
}

function buildSlider(
  idPrefix: string,
  label: string,
  initialValue: number,
  format: (value: number) => string,
  onChange: (value: number) => void,
  config: RangeConfig,
  info: ControlInfo | undefined,
): { el: HTMLElement; get: () => number; set: (v: number) => void } {
  const id = `${idPrefix}-${++nextId}`;
  let current = initialValue;

  const wrap = document.createElement("div");
  wrap.className = "field";

  const labelEl = document.createElement("label");
  labelEl.className = "lbl";
  labelEl.htmlFor = id;
  labelEl.textContent = label;

  const row = document.createElement("div");
  row.className = "field-row";

  const range = document.createElement("input");
  range.type = "range";
  range.id = id;
  range.min = config.min;
  range.max = config.max;
  range.step = config.step;

  const out = document.createElement("output");
  out.htmlFor = id;

  row.append(range, out);
  wrap.append(labelRow(labelEl, label, info), row);

  function render(): void {
    range.value = config.toRange(current);
    out.textContent = format(current);
  }
  render();

  range.addEventListener("input", () => {
    current = config.fromRange(range.value);
    out.textContent = format(current);
    onChange(current);
  });

  return {
    el: wrap,
    get: () => current,
    set: (v: number) => {
      current = v;
      render();
    },
  };
}

/**
 * A `<input type="range">` mapped log-uniformly onto [min, max], with a
 * visible `<output>`. Interactive input fires `onChange`; setting `.value`
 * programmatically updates the control without firing it.
 * `min` and `max` must both be > 0, since the mapping is a log scale.
 */
export function createLogSlider(opts: LogSliderOptions): LogSlider {
  const { min, max, onChange } = opts;
  if (min <= 0 || max <= 0) {
    throw new RangeError("createLogSlider: min and max must be > 0 (log scale)");
  }
  const format = opts.format ?? formatLr;

  const slider = buildSlider(
    "log-slider",
    opts.label,
    opts.value,
    format,
    onChange,
    {
      min: "0",
      max: String(STEPS),
      step: "1",
      toRange: (value) => String(stepFor(value, min, max)),
      fromRange: (raw) => valueFor(Number(raw), min, max),
    },
    opts.info,
  );

  return {
    el: slider.el,
    get value() {
      return slider.get();
    },
    set value(v: number) {
      slider.set(v);
    },
  };
}

/**
 * A native `<input type="range">` on a linear scale, with a visible
 * `<output>`. Interactive input fires `onChange`; setting `.value`
 * programmatically updates the control without firing it.
 */
export function createSlider(opts: SliderOptions): Slider {
  const format = opts.format ?? ((v: number) => fmt(v, 3));

  const slider = buildSlider(
    "slider",
    opts.label,
    opts.value,
    format,
    opts.onChange,
    {
      min: String(opts.min),
      max: String(opts.max),
      step: String(opts.step),
      toRange: (value) => String(value),
      fromRange: (raw) => Number(raw),
    },
    opts.info,
  );

  return {
    el: slider.el,
    get value() {
      return slider.get();
    },
    set value(v: number) {
      slider.set(v);
    },
  };
}
