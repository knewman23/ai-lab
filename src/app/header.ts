/** Icons only; kept as markup so they stay byte-identical to the portfolio's. */
const THEME_BUTTON = `
  <button class="theme keep" id="theme" type="button" aria-live="polite">
    <svg class="i-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
    <svg class="i-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/></svg>
    <span id="theme-text">Dark</span>
  </button>`;

/** A breadcrumb part: plain text for the current page, or a link. */
export type Crumb = string | { readonly text: string; readonly href: string };

export interface Header {
  readonly el: HTMLElement;
  setBreadcrumb(parts: readonly Crumb[]): void;
}

function homeLink(): HTMLAnchorElement {
  const home = link("#/", "Home");
  // `.keep` survives the band's 760px rule, so phones keep a way back.
  home.className = "keep";
  return home;
}

function link(href: string, text: string): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.textContent = text;
  return anchor;
}

/**
 * The sticky top band. Built synchronously at boot so `public/theme.js`, a
 * deferred classic script, finds `#theme` and `#theme-text` when it runs.
 */
export function renderHeader(): Header {
  const band = document.createElement("div");
  band.className = "band";

  const wrap = document.createElement("div");
  wrap.className = "wrap";

  const label = document.createElement("span");
  label.className = "lbl";
  const name = document.createElement("b");
  name.textContent = "KRYS NEWMAN";
  // The owner's name and its separator hide on narrow screens so the crumbs fit.
  const owner = document.createElement("span");
  owner.className = "owner";
  owner.append(name, "\u00a0/\u00a0");
  const crumbs = document.createElement("span");
  crumbs.className = "crumbs";
  label.append(owner, link("#/", "AI LAB"), crumbs);

  const nav = document.createElement("nav");
  nav.setAttribute("aria-label", "Sections");
  nav.append(link("https://knewman23.github.io/", "Index"), homeLink());
  // Static, author-written markup: the two toggle icons.
  nav.insertAdjacentHTML("beforeend", THEME_BUTTON);

  wrap.append(label, nav);
  band.append(wrap);

  return {
    el: band,
    setBreadcrumb(parts) {
      // `.lbl` uppercases; the separator matches the fixed part of the label.
      // Link crumbs navigate (e.g. `#/machine-learning` scrolls home to that
      // topic); the last crumb names the current page and stays text.
      crumbs.replaceChildren(
        ...parts.flatMap((part) => [
          "\u00a0/\u00a0",
          typeof part === "string" ? part : link(part.href, part.text),
        ]),
      );
    },
  };
}
