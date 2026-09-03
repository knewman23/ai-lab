// Imported here, not in main.ts, so KaTeX's stylesheet ships with the chunk
// that renders equations instead of preloading on the home page.
import "katex/dist/katex.min.css";
import katex from "katex";

export interface Equation {
  el: HTMLDivElement;
  set: (tex: string) => void;
}

/** A `<div class="equation">` that renders display-mode KaTeX. `set` is a no-op when `tex` is unchanged. */
export function createEquation(): Equation {
  const el = document.createElement("div");
  el.className = "equation";

  let last: string | undefined;

  return {
    el,
    set(tex: string) {
      if (tex === last) return;
      last = tex;

      if (tex === "") {
        el.innerHTML = "";
        return;
      }

      katex.render(tex, el, { displayMode: true, throwOnError: false });
    },
  };
}
