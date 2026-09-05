/**
 * The collapsible overview that opens each scene's panel: what the tool is for, where the idea
 * is used outside a teaching page, and one concrete case to hold in mind while playing with it.
 *
 * A native `<details>` rather than a hand-rolled disclosure: it comes with the keyboard and
 * screen-reader behaviour already, and the walkthrough closes it by setting `open` rather than by
 * fighting a class.
 */

export interface OverviewSpec {
  /** The line shown when it is closed. One sentence, no full stop needed. */
  readonly summary: string;
  /** What the tool is for. */
  readonly objective: string;
  /** Where the idea does real work. */
  readonly whereUsed: string;
  /** One worked case, named and specific. */
  readonly example: string;
}

export interface Overview {
  readonly el: HTMLElement;
  /** Closes it without destroying it; the visitor can open it again. */
  collapse(): void;
}

const SECTIONS: readonly { readonly heading: string; readonly key: keyof OverviewSpec }[] = [
  { heading: "What it's for", key: "objective" },
  { heading: "Where it's used", key: "whereUsed" },
  { heading: "The picture to hold", key: "example" },
];

/** Open on arrival, so the framing is read at least once; the walkthrough closes it when it starts. */
export function createOverview(spec: OverviewSpec): Overview {
  const el = document.createElement("details");
  el.className = "overview";
  el.dataset.role = "overview";
  el.open = true;

  const summary = document.createElement("summary");
  summary.className = "overview-summary";

  const label = document.createElement("span");
  label.className = "lbl";
  label.textContent = "Overview";

  const line = document.createElement("span");
  line.className = "overview-line";
  line.textContent = spec.summary;

  summary.append(label, line);
  el.append(summary);

  const body = document.createElement("div");
  body.className = "overview-body";
  for (const { heading, key } of SECTIONS) {
    const title = document.createElement("h4");
    title.className = "lbl";
    title.textContent = heading;

    const text = document.createElement("p");
    text.textContent = spec[key];

    body.append(title, text);
  }
  el.append(body);

  return {
    el,
    collapse(): void {
      el.open = false;
    },
  };
}
