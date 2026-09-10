/**
 * `TextInput`. The flavours are the union `inference.ts` produces from the IR,
 * so a hand-written field and an inferred one describe themselves the same way.
 */
import { configured } from "../component.js";
import type { FieldState, ValidationRule } from "../field.js";
import { baseFieldState, Field, lengthRules, ruleFor } from "../field.js";
import type { TextFlavour } from "../inference.js";

export interface TextInputState extends FieldState {
  readonly flavour: TextFlavour;
  readonly minLength?: number;
  readonly maxLength?: number;
  /** `ignoreRecord` excludes the row being edited from the uniqueness check. */
  readonly unique?: { readonly ignoreRecord: boolean };
  readonly step?: number;
  /**
   * The shape a value takes as it is typed.
   *
   * `9` is a digit, `a` a letter, `*` either. Everything else is a literal the
   * reader does not type — the browser writes it for them, and the boot refuses
   * a literal that is alphanumeric, because a mask whose punctuation could also
   * be a placeholder cannot be read back out of a value.
   *
   * A shape, not a storage decision. What the column keeps is what
   * `dehydrateStateUsing` says it keeps, as it always was, and the rule below
   * accepts a value with the literals and one without: a row written before the
   * mask existed is not a row that has suddenly become invalid.
   */
  readonly mask?: string;
  /**
   * What sits inside the frame, on either side of what is typed.
   *
   * Part of the box rather than of the value: `https://` in front of a field
   * says what the reader need not type, and the column keeps only what they
   * did. A field that wanted the affix stored would have to write it in a
   * `dehydrateStateUsing`, where the decision is visible.
   *
   * Here rather than on every field, because an affix is a thing that sits
   * beside a line of text. There is no left-hand side of a checkbox.
   */
  readonly prefix?: string;
  readonly suffix?: string;
  /** The marks beside them, by name. Decoration: the words carry the meaning. */
  readonly prefixIcon?: string;
  readonly suffixIcon?: string;
}

export class TextInput extends Field {
  declare readonly state: TextInputState;

  override get type(): string {
    return "TextInput";
  }

  mask(pattern: string): this {
    return this.with({ mask: pattern });
  }

  prefix(value: string): this {
    return this.with({ prefix: value });
  }

  suffix(value: string): this {
    return this.with({ suffix: value });
  }

  prefixIcon(name: string): this {
    return this.with({ prefixIcon: name });
  }

  suffixIcon(name: string): this {
    return this.with({ suffixIcon: name });
  }

  protected override with(patch: Partial<TextInputState>): this {
    return super.with(patch);
  }

  override get declaredRules(): readonly ValidationRule[] {
    return [
      ...lengthRules(this.state.minLength, this.state.maxLength),
      ...stepRules(this.state.step),
      ...flavourRules(this.state.flavour),
      ...maskRules(this.state.mask),
    ];
  }

  static make(name: string): TextInput {
    // A typed variable, not a literal: the excess property check only fires on
    // fresh literals, and would otherwise force a widening constructor.
    const state: TextInputState = { ...baseFieldState(name), flavour: "text" };
    return configured(new TextInput(state));
  }

  email(): this {
    return this.with({ flavour: "email" });
  }

  url(): this {
    return this.with({ flavour: "url" });
  }

  /** A blank password must not overwrite the stored hash with "". */
  password(): this {
    return this.with({ flavour: "password", dehydrateWhenEmpty: false });
  }

  tel(): this {
    return this.with({ flavour: "tel" });
  }

  /**
   * A number, and optionally the grain it comes in: `0.5`, `100`, `0.01`.
   *
   * The step is enforced here rather than by the browser. The control is
   * deliberately not `type="number"` — spinners, silent locale parsing, a
   * scroll-wheel trap — and `step` means nothing on anything else, so a reader
   * is never stopped from typing `2.45`. They are told when they try to save
   * it, which is the honest half of "the state is authoritative on the server".
   */
  numeric(step?: number): this {
    return this.with({ flavour: "numeric", ...(step === undefined ? {} : { step }) });
  }

  minLength(value: number): this {
    return this.with({ minLength: value });
  }

  maxLength(value: number): this {
    return this.with({ maxLength: value });
  }

  /** Defaults to ignoring the row being edited, or editing it fails its own check. */
  unique(options: { readonly ignoreRecord?: boolean } = {}): this {
    return this.with({ unique: { ignoreRecord: options.ignoreRecord ?? true } });
  }
}

/**
 * The grain a declared step implies.
 *
 * Not a modulo. `2.4 % 0.1` is 0.09999999999999978 in binary floating point, so
 * the obvious check refuses the value it was written to allow. Dividing and
 * looking at how far the quotient sits from a whole number keeps the error
 * where it belongs — at the fifteenth decimal, which no step reaches.
 *
 * A value that is not a number passes. That is a different complaint, and one
 * nothing makes yet.
 */
/**
 * What the flavour promises, kept.
 *
 * `.email()` and `.numeric()` chose the control a browser draws, and that was
 * the whole enforcement: an `input[type=email]` refuses what a person types and
 * refuses nothing else. Anything that reaches the field another way — a forged
 * state, a cell in a table — was writing `not-an-address` into the column the
 * form promised held an address.
 *
 * Deliberately loose on email. There is no expression that matches every
 * address and no other, and a form that turns away a valid one is worse than a
 * column with a curious value in it: one is a bug the reader cannot get past,
 * the other is a row somebody fixes. So: something, an `@`, something with a
 * dot in it, and no spaces.
 */
function flavourRules(flavour: TextFlavour): readonly ValidationRule[] {
  if (flavour === "email") {
    return [
      ruleFor("email", (value) =>
        !isText(value) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
          ? true
          : "Must be an email address.",
      ),
    ];
  }
  if (flavour === "url") {
    return [
      ruleFor("url", (value) =>
        !isText(value) || isUrl(value) ? true : "Must be a link.",
      ),
    ];
  }
  if (flavour === "numeric") {
    return [
      ruleFor("numeric", (value) =>
        !isText(value) || numberOf(value) !== undefined ? true : "Must be a number.",
      ),
    ];
  }
  return [];
}

/** Anything else is the field's own business: `admits` has already had its say. */
function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Asked of the parser a browser uses, rather than of a pattern. */
function isUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Which characters a mask position accepts, by the letter that stands for it. */
const PLACEHOLDERS: Readonly<Record<string, RegExp>> = {
  "9": /\d/,
  a: /[a-z]/i,
  "*": /[a-z0-9]/i,
};

/** Whether a character is one a reader fills rather than one the mask writes. */
/**
 * A mask, one character at a time.
 *
 * Code points rather than UTF-16 units: a mask is compared position by position
 * against what was typed, and half a character is not a position.
 */
export function charactersIn(mask: string): readonly string[] {
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- code points are the point
  return [...mask];
}

export function isPlaceholder(character: string): boolean {
  return character in PLACEHOLDERS;
}

/**
 * A mask on the server, which is what makes it more than a formatting trick.
 *
 * The literals are stripped before comparing, so `(555) 123-4567` and
 * `5551234567` both fit `(999) 999-9999`. A rule that demanded the punctuation
 * would refuse every row written before the mask was added, and refuse one
 * whose `dehydrateStateUsing` takes the punctuation off — which is the ordinary
 * way to store a number.
 */
function maskRules(mask: string | undefined): readonly ValidationRule[] {
  if (mask === undefined) return [];
  const wanted = charactersIn(mask).filter(isPlaceholder);
  if (wanted.length === 0) return [];

  return [
    ruleFor("mask", (value) => {
      if (!isText(value)) return true;
      const filled = value.match(/[a-z0-9]/gi) ?? [];
      const fits =
        filled.length === wanted.length &&
        wanted.every((slot, at) => PLACEHOLDERS[slot]?.test(filled[at] ?? "") === true);
      return fits ? true : `Must look like ${mask}.`;
    }),
  ];
}

function stepRules(step: number | undefined): readonly ValidationRule[] {
  if (step === undefined) return [];
  return [
    ruleFor("step", (value) => {
      const amount = numberOf(value);
      if (amount === undefined) return true;
      return onTheStep(amount, step) ? true : `Must be a multiple of ${String(step)}.`;
    }),
  ];
}

/** A number, or a string of one. The wire carries both, from a row and a form. */
function numberOf(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * What the division is allowed to be out by.
 *
 * Sized on the error it exists to absorb: a quotient carries a few units in the
 * last place, and thirty-two of them is room to spare. A round number instead —
 * `1e-9` — grows past half a step once the quotient passes five hundred
 * million, and everything above that stops being checked at all.
 *
 * Capped for the same reason one decade further up: proportional slack
 * eventually swallows half a step whatever the constant, and a value exactly
 * between two steps has to be refused at every magnitude. The cap is safe
 * because a real multiple's quotient is out by units in the last place, which
 * stay far below a quarter until the double is coarser than the step itself.
 */
const SLACK = 32 * Number.EPSILON;
const MOST_SLACK = 0.25;

function onTheStep(value: number, step: number): boolean {
  // A step that is not a positive number is a declaration the boot refuses, so
  // this never divides by one. Answering `true` is what a rule does when it has
  // nothing to say.
  if (!Number.isFinite(step) || step <= 0) return true;
  const quotient = value / step;
  const nearest = Math.round(quotient);
  const slack = Math.min(SLACK * Math.max(1, Math.abs(quotient)), MOST_SLACK);
  return Math.abs(quotient - nearest) <= slack;
}
