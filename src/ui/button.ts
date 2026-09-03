export interface ButtonOptions {
  label: string;
  onClick: () => void;
  variant?: "primary";
}

export interface Button {
  el: HTMLButtonElement;
  setLabel: (text: string) => void;
  setDisabled: (on: boolean) => void;
}

/** A native `<button type="button">`. */
export function createButton(opts: ButtonOptions): Button {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = opts.label;
  if (opts.variant === "primary") el.classList.add("btn-primary");

  el.addEventListener("click", () => {
    opts.onClick();
  });

  return {
    el,
    setLabel(text: string) {
      el.textContent = text;
    },
    setDisabled(on: boolean) {
      el.disabled = on;
    },
  };
}
