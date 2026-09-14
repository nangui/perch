/**
 * What a colour may be, before it is put in a style.
 *
 * A shape rather than a parse: nothing here has to know what the colour is.
 * What it does have to know is that the value came out of a row, and a row
 * holds whatever it holds — `url(...)` in a background is a request to
 * somewhere nobody chose.
 *
 * One rule for the cell and the entry, which ask the same question of values
 * out of the same rows. Two copies would be two answers, and the one nobody is
 * looking at is the one that goes wrong.
 */
const COLOUR = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgb\([^)]*\)|hsl\([^)]*\))$/i;

/** The value, trimmed, if it is one a style may be given. Otherwise nothing. */
export function swatchable(value: unknown): string | undefined {
  const said = typeof value === "string" ? value.trim() : "";
  return said !== "" && COLOUR.test(said) ? said : undefined;
}
