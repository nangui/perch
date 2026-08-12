/**
 * A choice, and the two ways of writing a list of them.
 *
 * Its own module rather than the select's, because `Option` belongs to no one
 * field. A select declares them, a filter declares them, a radio will, and the
 * trust boundary reads them to decide what a field may hold — which is what
 * made the old home a circular import between a base class and one of its
 * subclasses.
 */

export interface Option {
  readonly value: string | number | boolean;
  readonly label: string;
  /** Right-aligned annotation: a price, a duration, a code. */
  readonly meta?: string;
  readonly disabled?: boolean;
}

/** `{ draft: "Draft" }` is the shorthand; `Option[]` is the full form. */
export type OptionsInput = readonly Option[] | Readonly<Record<string, string>>;

/** Both accepted shapes to one, so nothing downstream knows the shorthand exists. */
export function normaliseOptions(input: OptionsInput): readonly Option[] {
  if (Array.isArray(input)) return input as readonly Option[];
  return Object.entries(input as Readonly<Record<string, string>>).map(
    ([value, label]) => ({ value, label }),
  );
}
