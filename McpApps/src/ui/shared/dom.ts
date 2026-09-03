/**
 * Tiny `getElementById` wrapper shared by every view.
 *
 * Not an MCP-Apps concept — plain housekeeping. Each `index.html` is
 * hand-written next to its `view.ts`, so a missing id is a real bug in this
 * sample, not something to paper over with a non-null assertion (`!`). This
 * throws a readable error instead, and lets call sites pin down the element
 * subtype (`requireElement<HTMLButtonElement>("refresh")`) without an `as`
 * cast.
 */
export function requireElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Expected an element with id="${id}" in this view's HTML, but none was found.`);
  }
  return el as T;
}
