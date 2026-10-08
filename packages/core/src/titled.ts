/**
 * A path, read as a heading, when nothing gave it one.
 *
 * Every field, column and entry may be given a label and most are. The ones
 * that are not showed their path verbatim, so a table read
 * `Species | Site | count | certainty` and a form asked for `name`, `region`,
 * `habitat` — the panel looking unfinished in a way no styling reaches.
 *
 * `@perchjs/nest` already had this for a page's title, twice, each copy
 * handling hyphens only. One copy now, and it handles what a path is actually
 * written in: `commonName`, `common_name`, `import-orders`.
 *
 * A dotted path keeps every segment — `site.name` is `Site name` and not
 * `Name`, because a table holding `site.name` beside `observer.name` would
 * otherwise head two columns the same. Anyone wanting shorter says so with a
 * label, which is the point of having one.
 */
export function titled(path: string): string {
  const words = path
    .replaceAll(".", " ")
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    // `commonName` → `common Name`, and `HTTPCode` → `HTTP Code` rather than
    // `H T T P Code`: an acronym is split off the word after it and not into
    // letters. Sentence case then makes it `Http code`, which is what every
    // other heading here reads like.
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  return words === "" ? path : words.charAt(0).toUpperCase() + words.slice(1);
}
