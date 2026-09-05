/**
 * The outline a walkthrough step draws around the control its prose names.
 *
 * The registry is a `Record` over the scene's own control-id union, so a step
 * cannot name a control the panel does not register: adding a union member
 * without an element fails to compile. The runtime throw below is for the one
 * case the type cannot catch — a member registered as a value the panel never
 * actually built.
 */
export function createControlFocus<C extends string>(
  controls: Readonly<Record<C, HTMLElement>>,
): (id: C | undefined) => void {
  let current: HTMLElement | undefined;

  return (id: C | undefined): void => {
    current?.classList.remove("is-focused");
    current = undefined;
    if (id === undefined) return;

    const el = controls[id];
    if (!el) throw new Error(`control focus: "${id}" is in the union but was never registered`);
    el.classList.add("is-focused");
    current = el;
  };
}
