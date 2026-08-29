/**
 * The shape a value takes as it is typed.
 *
 * `9` is a digit, `a` a letter, `*` either. Everything else is a literal the
 * reader does not type — this writes it for them, and stops writing as soon as
 * they run out of characters, so a half-filled box shows half a shape rather
 * than a row of waiting punctuation.
 *
 * The same reading the server does, written a second time on purpose: a rule
 * that has to hold on both sides is expressed on both sides, and this half is
 * the one that decides what a keystroke looks like. The two must not drift — a
 * box that accepts what the server refuses is worse than no mask.
 */
const PLACEHOLDERS: Readonly<Record<string, RegExp>> = {
  "9": /\d/,
  a: /[a-z]/i,
  "*": /[a-z0-9]/i,
};

/**
 * What the box should show, given what is in it.
 *
 * Built from the characters the reader has actually typed rather than from the
 * string as it stands: the literals are this file's to write, so a value
 * arriving with them and one arriving without come out the same. That is what
 * lets a column keep bare digits and a box show a telephone number.
 *
 * A character that does not fit the position it lands in is dropped. Typing a
 * letter into `(999)` puts nothing on screen, which is the one thing a mask is
 * for.
 */
export function masked(value: string, mask: string): string {
  const filled = filledIn(value);

  let out = "";
  // Literals are held back until a character actually lands after them, so a
  // box never ends in punctuation nobody typed — including when what is left of
  // the value fits nowhere.
  let pending = "";
  let at = 0;
  for (const slot of mask) {
    const wants = PLACEHOLDERS[slot];
    if (wants === undefined) {
      pending += slot;
      continue;
    }

    // Skip what cannot go here rather than stopping: a paste carrying a stray
    // character should lose that character, not everything after it.
    while (at < filled.length && !wants.test(filled[at] ?? "")) at += 1;
    if (at >= filled.length) break;

    out += pending + (filled[at] ?? "");
    pending = "";
    at += 1;
  }

  return out;
}

/**
 * What the box should show for a value it did not shape itself.
 *
 * A value straight from a column has been through no keystroke, and may not fit
 * the mask at all — a row written before the mask existed, or one a mask was
 * put over. Shaping it anyway would show `(555) ` for `555CALLNOW` while the
 * field still holds the whole thing: the reader would be refused by a rule
 * their box appears to satisfy.
 *
 * So the shape is shown only when it costs nothing. Anything the reader typed
 * arrives already shaped and passes through unchanged.
 */
export function shownAs(value: string, mask: string): string {
  const shaped = masked(value, mask);
  return filledIn(shaped).length === filledIn(value).length ? shaped : value;
}

/**
 * Where the caret goes once the value is reshaped.
 *
 * A controlled input has its value rewritten on every render, and the browser
 * puts the caret at the end when that happens. Corrections land in the middle,
 * so the position is carried across by what it sits behind: the count of
 * characters the reader filled before it, which reshaping does not change.
 */
export function caretAfter(shown: string, filledBefore: number): number {
  if (filledBefore <= 0) return 0;

  let seen = 0;
  for (let at = 0; at < shown.length; at += 1) {
    if (/[a-z0-9]/i.test(shown[at] ?? "")) {
      seen += 1;
      if (seen === filledBefore) return at + 1;
    }
  }
  return shown.length;
}

/** The characters a reader fills, as opposed to the ones a mask writes. */
export function filledIn(value: string): readonly string[] {
  return value.match(/[a-z0-9]/gi) ?? [];
}

/** How many characters a mask has room for, which is what caps a box. */
export function roomIn(mask: string): number {
  return mask.length;
}
