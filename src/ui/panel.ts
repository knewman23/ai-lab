export interface Panel {
  el: HTMLElement;
  section: (title: string) => HTMLElement;
}

/** A side panel container. `section(title)` appends a titled section and returns it for content. */
export function createPanel(): Panel {
  const el = document.createElement("div");
  el.className = "panel";

  return {
    el,
    section(title: string): HTMLElement {
      const section = document.createElement("section");
      section.className = "panel-section";

      const heading = document.createElement("h3");
      heading.className = "lbl";
      heading.textContent = title;

      section.append(heading);
      el.append(section);
      return section;
    },
  };
}
