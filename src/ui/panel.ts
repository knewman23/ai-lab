export interface SectionOptions {
  /**
   * Marks the section the walkthrough's step card replaces. The shell collapses
   * it while a walkthrough is running, so the panel does not show two
   * paragraphs of prose at once.
   */
  readonly role?: "explanation";
}

export interface Panel {
  el: HTMLElement;
  section: (title: string, opts?: SectionOptions) => HTMLElement;
}

/** A side panel container. `section(title)` appends a titled section and returns it for content. */
export function createPanel(): Panel {
  const el = document.createElement("div");
  el.className = "panel";

  return {
    el,
    section(title: string, opts?: SectionOptions): HTMLElement {
      const section = document.createElement("section");
      section.className = "panel-section";
      if (opts?.role) section.dataset.role = opts.role;

      const heading = document.createElement("h3");
      heading.className = "lbl";
      heading.textContent = title;

      section.append(heading);
      el.append(section);
      return section;
    },
  };
}
