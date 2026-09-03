import { TOPICS, topicTitle, type RegistryEntry } from "../viz/types";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderCard(entry: RegistryEntry, index: number): HTMLElement {
  const live = entry.status === "ready";
  const card = live ? el("a", "card") : el("div", "card");
  if (live) {
    (card as HTMLAnchorElement).href = `#/${entry.topic}/${entry.id}`;
  } else {
    card.setAttribute("aria-disabled", "true");
  }

  const top = el("div", "ctop");
  top.append(
    el("span", "cn", String(index + 1).padStart(2, "0")),
    el("span", live ? "pill p-live" : "pill p-soon", live ? "Live" : "Soon"),
  );

  const foot = el("div", "cfoot");
  foot.append(el("span", "tags", topicTitle(entry.topic)));
  if (live) foot.append(el("span", "go", "Open →"));

  card.append(top, el("h3", undefined, entry.title), el("p", undefined, entry.summary), foot);
  return card;
}

/** The `#/` page: one section per topic, each a grid of algorithm cards. */
export function renderHome(entries: readonly RegistryEntry[]): HTMLElement {
  const page = el("div", "home-page wrap");

  for (const topic of TOPICS) {
    const section = el("section", "topic");
    section.append(el("h2", undefined, topic.title));

    const inTopic = entries.filter((entry) => entry.topic === topic.slug);
    if (inTopic.length === 0) {
      section.append(el("p", "empty", "Visualizations for this topic are coming."));
    } else {
      const grid = el("div", "home");
      inTopic.forEach((entry, index) => grid.append(renderCard(entry, index)));
      section.append(grid);
    }

    page.append(section);
  }

  return page;
}
