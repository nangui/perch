/**
 * Counted in graphemes, because that is what the person typing counts.
 *
 * The same count the server makes, written a second time on purpose: the
 * renderer takes types from the domain and no behaviour, so a rule that has to
 * hold on both sides is expressed on both sides. The two must not drift — a
 * footer reading "7 / 3" over a field the server saves without complaint is
 * worse than no footer.
 *
 * Written once here rather than once per field, so the second copy stays one.
 */
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * The pieces themselves, for the two places that want one of them.
 *
 * Spreading a string gives code points and `.split("")` gives code units, and
 * both cut a family emoji or a letter with a combining accent in half. The
 * first letter of a name and the characters of a matched glyph are exactly the
 * places that shows.
 */
export function graphemesOf(text: string): readonly string[] {
  return [...GRAPHEMES.segment(text)].map((piece) => piece.segment);
}

export function countGraphemes(text: string): number {
  let seen = 0;
  const walk = GRAPHEMES.segment(text)[Symbol.iterator]();
  while (!walk.next().done) seen += 1;
  return seen;
}
