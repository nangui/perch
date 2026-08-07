/**
 * `Select` — PRD 06 §3.1 calls it the most important field in the catalogue,
 * and milestone A1 is built out of two of them.
 */
import type { Resolvable } from "../component.js";
import { configured } from "../component.js";
import type { FieldState } from "../field.js";
import { baseFieldState, Field } from "../field.js";

export interface Option {
  readonly value: unknown;
  readonly label: string;
  readonly disabled?: boolean;
}

/** `{ draft: "Draft" }` is the shorthand; `Option[]` is the full form. */
export type OptionsInput = readonly Option[] | Readonly<Record<string, string>>;

export interface SelectState extends FieldState {
  readonly options?: Resolvable<OptionsInput>;
  readonly relationship?: { readonly name: string; readonly labelField: string };
  readonly searchable: boolean;
  readonly multiple: boolean;
  readonly preload: boolean;
  readonly optionsLimit: number;
}

const DEFAULT_OPTIONS_LIMIT = 50;

export class Select extends Field {
  declare readonly state: SelectState;

  override get type(): string {
    return "Select";
  }

  protected override with(patch: Partial<SelectState>): this {
    return super.with(patch);
  }

  /** ARCH 13 §5: a discrete choice commits immediately. */
  protected override get defaultDebounce(): number {
    return 0;
  }

  static make(name: string): Select {
    const state: SelectState = {
      ...baseFieldState(name),
      searchable: false,
      multiple: false,
      preload: false,
      optionsLimit: DEFAULT_OPTIONS_LIMIT,
    };
    return configured(new Select(state));
  }

  options(value: Resolvable<OptionsInput>): this {
    return this.with({ options: value });
  }

  /** Loads the labels, searches them, persists the foreign key. */
  relationship(name: string, labelField = "name"): this {
    return this.with({ relationship: { name, labelField } });
  }

  /** Searches on the server. Filtering 10k options in the browser is the bug. */
  searchable(value = true): this {
    return this.with({ searchable: value });
  }

  multiple(value = true): this {
    return this.with({ multiple: value });
  }

  /** Loads every option up front; only safe on a bounded set. */
  preload(value = true): this {
    return this.with({ preload: value });
  }

  optionsLimit(value: number): this {
    return this.with({ optionsLimit: value });
  }
}

/** Both accepted shapes to one, so nothing downstream knows the shorthand exists. */
export function normaliseOptions(input: OptionsInput): readonly Option[] {
  if (Array.isArray(input)) return input as readonly Option[];
  return Object.entries(input as Readonly<Record<string, string>>).map(
    ([value, label]) => ({ value, label }),
  );
}
