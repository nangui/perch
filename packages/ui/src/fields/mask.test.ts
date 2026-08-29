/**
 * What a box shows as it is typed into.
 *
 * The literals are this file's to write, so what the reader types is only ever
 * the characters they fill. That is also what lets a column keep bare digits
 * and the box show a telephone number: the value arrives either way and comes
 * out the same.
 *
 * The server reads the same shape and refuses what does not fit it. These two
 * must not drift — a box that accepts what the server refuses is worse than no
 * mask at all — which is what `mask-agreement.test.ts` beside this holds.
 */
import { describe, expect, it } from "vitest";
import { caretAfter, filledIn, masked, shownAs } from "./mask.js";

describe("as it is typed", () => {
  it("writes the punctuation the reader does not", () => {
    expect(masked("5", "(999) 999-9999")).toBe("(5");
    expect(masked("555", "(999) 999-9999")).toBe("(555");
    expect(masked("5551", "(999) 999-9999")).toBe("(555) 1");
    expect(masked("5551234567", "(999) 999-9999")).toBe("(555) 123-4567");
  });

  it("stops where the reader has, rather than showing what is waiting", () => {
    // A box that fills with punctuation nobody typed reads as a box that has
    // been filled in.
    expect(masked("", "(999) 999-9999")).toBe("");
  });

  it("comes out the same whether the punctuation arrived or not", () => {
    // Which is the whole reason the literals are written here rather than kept
    // in the value: a column holding bare digits shows a telephone number.
    expect(masked("5551234567", "(999) 999-9999")).toBe(
      masked("(555) 123-4567", "(999) 999-9999"),
    );
  });

  it("drops what cannot go where it landed", () => {
    // Typing a letter into `(999)` puts nothing on screen, which is the one
    // thing a mask is for.
    expect(masked("55a5", "(999) 999-9999")).toBe("(555");
    expect(masked("ab12", "aa-9999")).toBe("ab-12");
  });

  it("keeps what fits after something that did not", () => {
    // A paste carrying a stray character should lose that character, not
    // everything after it.
    expect(masked("555-abc-1234", "(999) 999-9999")).toBe("(555) 123-4");
  });

  it("takes no more than the shape has room for", () => {
    expect(masked("55512345679999", "(999) 999-9999")).toBe("(555) 123-4567");
  });

  it("reads letters and either where the mask asks for them", () => {
    expect(masked("AB1234", "aa-9999")).toBe("AB-1234");
    expect(masked("a1b2", "**-**")).toBe("a1-b2");
  });

  it("never ends in punctuation nobody typed", () => {
    // Including when what is left of the value fits nowhere: `555CALLNOW` used
    // to come out as `(555) `, a closed bracket over an empty position.
    expect(masked("555CALLNOW", "(999) 999-9999")).toBe("(555");
    expect(masked("555", "(999) 999-9999")).toBe("(555");
    expect(masked("ab", "aa-9999")).toBe("ab");
  });
});

describe("a value the box did not shape itself", () => {
  it("is shown as it stands where the mask cannot hold it", () => {
    // A row written before the mask existed. Shaping it would show `(555` while
    // the field still holds the whole thing, and the reader would be refused by
    // a rule their box appears to satisfy.
    expect(shownAs("555CALLNOW", "(999) 999-9999")).toBe("555CALLNOW");
    expect(shownAs("55512345678901", "(999) 999-9999")).toBe("55512345678901");
  });

  it("is shaped where that costs nothing", () => {
    // Which is how a column of bare digits comes out as a telephone number.
    expect(shownAs("5551234567", "(999) 999-9999")).toBe("(555) 123-4567");
    expect(shownAs("555", "(999) 999-9999")).toBe("(555");
    expect(shownAs("", "(999) 999-9999")).toBe("");
  });

  it("passes anything the reader typed through unchanged", () => {
    // What `onChange` writes back is already shaped, so displaying it must not
    // move it — otherwise every keystroke would fight the one before.
    for (const typed of ["5", "5551234567", "(555) 123-4", "ab-12"]) {
      const mask =
        typed.includes("-") && /[a-z]/i.test(typed) ? "aa-9999" : "(999) 999-9999";
      const shaped = masked(typed, mask);
      expect(shownAs(shaped, mask)).toBe(shaped);
    }
  });
});

describe("where the caret goes once the value is reshaped", () => {
  it("stays behind the characters it was behind", () => {
    // Correcting the second digit of `(555) 123-4567` must leave the caret
    // after that digit, not at the end of the box.
    expect(caretAfter("(595) 512-3456", 2)).toBe(3);
    expect(caretAfter("(555) 123-4567", 3)).toBe(4);
    // Just after a run of literals, the caret sits after the character that
    // follows them rather than between the brackets.
    expect(caretAfter("(555) 123-4567", 4)).toBe(7);
  });

  it("sits at the front where nothing is behind it", () => {
    expect(caretAfter("(555", 0)).toBe(0);
  });

  it("sits at the end where the count runs past what is shown", () => {
    // A character the mask dropped: the reader typed it, and it is not there.
    expect(caretAfter("(555", 9)).toBe(4);
  });

  it("counts what a reader fills and not what a mask writes", () => {
    expect(filledIn("(555) 12").length).toBe(5);
    expect(filledIn("").length).toBe(0);
  });
});
