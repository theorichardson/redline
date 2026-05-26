/**
 * Format an element's display name for tooltips and clipboard copy.
 * Matches the `<tag>#id.class` style shown in the hover tooltip.
 */
export function formatElementDisplayName(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const classes = Array.from(element.classList)
    .slice(0, 3)
    .map((c) => `.${c}`)
    .join('');

  let name = `<${tag}>`;
  if (id) name += id;
  if (classes) name += classes;
  return name;
}
