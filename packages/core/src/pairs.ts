/**
 * What a `Json` column holds, read as pairs.
 *
 * One reading, for the form that edits a column and the infolist that shows
 * it. They meet the same shape — a flat object of settings, metadata, labels,
 * nobody here chose its keys — and two readings would be two answers about a
 * key with a space around it, about the same name twice, and about an entry
 * holding something that is not text. A reader who edits a column and then
 * views it would be shown two different things and have to decide which.
 *
 * Read defensively. A `Json` column is the one place a panel meets a shape it
 * did not design, so what is not a plain object is not half-converted here —
 * each half says what it does with that instead.
 */

/** One row: what it is called, and what it says. */
export type Pair = readonly [key: string, value: string];

/**
 * The pairs an object stands for, or nothing if the value is not one.
 *
 * A key is trimmed, and one that is then blank is left out — there is no row
 * to draw for a name nobody can read. Two keys that differ only by the space
 * around them are one key, and the first is kept: the second cannot be told
 * apart from it on a page, and a form handed both is a form that cannot save.
 *
 * An entry holding something other than text is shown as the JSON it is,
 * rather than dropped. Dropping it takes it off the page, and a save that
 * writes the pairs and nothing else would then take it out of the column too,
 * with nobody having asked. What it costs is that a number saved back is text.
 */
export function pairsOf(value: unknown): Pair[] | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const pairs: Pair[] = [];
  const seen = new Set<string>();
  for (const [key, held] of Object.entries(value)) {
    const name = key.trim();
    if (name === "" || seen.has(name)) continue;
    // `undefined` is the one thing JSON has no text for. It is not a value a
    // column holds either, so there is nothing to lose by passing over it.
    if (held === undefined) continue;
    seen.add(name);
    pairs.push([name, typeof held === "string" ? held : JSON.stringify(held)]);
  }
  return pairs;
}
