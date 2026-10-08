/**
 * What to call a node the resource did not name.
 *
 * Twenty-four places read `label ?? path` and showed the path verbatim, so a
 * table headed `Species | Site | count | certainty` and a form asked for
 * `name`, `region`, `habitat`. One reading of it now, and the path is read as
 * a heading rather than printed.
 *
 * The same arithmetic lives in `@perchjs/core`, where the page titles use it,
 * and this is a copy rather than an import on purpose: core is a development
 * dependency of this package, so a value taken from it would compile here and
 * fail for whoever installs the renderer — besides dragging domain code into a
 * browser bundle. `heading.test.ts` holds the two in step.
 */
function titled(path: string): string {
  const words = path
    .replaceAll(".", " ")
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  return words === "" ? path : words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A label of `""` is kept, because that is a resource saying it wants none —
 * `??` falls back on absence and not on emptiness, which is the difference
 * between unnamed and deliberately blank.
 */
export function headingOf(node: {
  readonly label?: string | undefined;
  readonly path?: string | undefined;
}): string {
  if (node.label !== undefined) return node.label;
  return node.path === undefined ? "" : titled(node.path);
}
