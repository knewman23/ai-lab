export interface ToggleOptions {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export interface Toggle {
  el: HTMLElement;
  get checked(): boolean;
  set checked(v: boolean);
}

/** A native checkbox styled as a switch, wrapped in a clickable `<label>`. */
export function createToggle(opts: ToggleOptions): Toggle {
  const wrap = document.createElement("label");
  wrap.className = "switch";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = opts.checked;

  const track = document.createElement("span");
  track.className = "switch-track";
  track.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "switch-label lbl";
  text.textContent = opts.label;

  input.addEventListener("change", () => {
    opts.onChange(input.checked);
  });

  wrap.append(input, track, text);

  return {
    el: wrap,
    get checked() {
      return input.checked;
    },
    set checked(v: boolean) {
      input.checked = v;
    },
  };
}
