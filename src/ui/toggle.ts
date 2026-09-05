export interface ToggleOptions {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Adds the "what does this do?" button beside the switch. */
  info?: ControlInfo;
}

import { createInfoButton, type ControlInfo } from "./info";

export interface Toggle {
  el: HTMLElement;
  get checked(): boolean;
  set checked(v: boolean);
}

/**
 * A native checkbox styled as a switch, wrapped in a clickable `<label>`. When it carries info,
 * the label goes inside a row alongside the button: a `<button>` may not sit inside a `<label>`
 * that labels something else, and clicking it would toggle the switch if it did.
 */
export function createToggle(opts: ToggleOptions): Toggle {
  const wrap = document.createElement("label");
  wrap.className = "switch";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("role", "switch");
  input.checked = opts.checked;
  input.setAttribute("aria-checked", String(opts.checked));

  const track = document.createElement("span");
  track.className = "switch-track";
  track.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "switch-label lbl";
  text.textContent = opts.label;

  input.addEventListener("change", () => {
    input.setAttribute("aria-checked", String(input.checked));
    opts.onChange(input.checked);
  });

  wrap.append(input, track, text);

  const el = opts.info ? withInfo(wrap, opts.label, opts.info) : wrap;

  return {
    el,
    get checked() {
      return input.checked;
    },
    set checked(v: boolean) {
      input.checked = v;
      input.setAttribute("aria-checked", String(v));
    },
  };
}

/** Wraps a switch in a row so its info button is a sibling rather than a child of the label. */
function withInfo(wrap: HTMLElement, label: string, info: ControlInfo): HTMLElement {
  const row = document.createElement("div");
  row.className = "switch-row";
  const { button, popover } = createInfoButton(label, info);
  row.append(wrap, button, popover);
  return row;
}
