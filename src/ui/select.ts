export interface SelectOption {
  value: string;
  title: string;
  disabled?: boolean;
}

export interface SelectOptions {
  label: string;
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
}

export interface Select {
  el: HTMLElement;
  get value(): string;
  set value(v: string);
}

let nextId = 0;

/** A labelled native `<select>`. */
export function createSelect(opts: SelectOptions): Select {
  const id = `select-${++nextId}`;

  const wrap = document.createElement("div");
  wrap.className = "field";

  const labelEl = document.createElement("label");
  labelEl.className = "lbl";
  labelEl.htmlFor = id;
  labelEl.textContent = opts.label;

  const select = document.createElement("select");
  select.id = id;
  for (const option of opts.options) {
    const optionEl = document.createElement("option");
    optionEl.value = option.value;
    optionEl.textContent = option.title;
    optionEl.disabled = option.disabled ?? false;
    select.append(optionEl);
  }
  select.value = opts.value;

  select.addEventListener("change", () => {
    opts.onChange(select.value);
  });

  wrap.append(labelEl, select);

  return {
    el: wrap,
    get value() {
      return select.value;
    },
    set value(v: string) {
      select.value = v;
    },
  };
}
