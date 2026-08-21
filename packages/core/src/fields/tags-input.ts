/**
 * `TagsInput` — a list the reader writes rather than picks from.
 *
 * The open counterpart of a `CheckboxList`: both hold several values and only
 * one of them has a set to be measured against. Here the reader invents the
 * members, so the field can say what a tag has to look like and cannot say
 * which tags exist.
 *
 * `.suggestions()` is that distinction in one word. They are proposals, not a
 * list — offering them and refusing anything else would be a closed set with
 * extra steps, and the field for a closed set is already written.
 */
import { configured } from "../component.js";
import type { FieldState, ValueRefusal } from "../field.js";
import { baseFieldState, Field, isUnset } from "../field.js";

export interface TagsInputState extends FieldState {
  /**
   * What the tags are joined by in the column, where they share one.
   *
   * Absent means the column holds a list. A separator is for the schema that
   * keeps tags in a `String`, which is the shape most of them are already in
   * when a panel is put in front of an existing database.
   */
  readonly separator?: string;
  /** Offered while typing. Proposals, never a set to be measured against. */
  readonly suggestions?: readonly string[];
}

export class TagsInput extends Field {
  declare readonly state: TagsInputState;

  override get type(): string {
    return "TagsInput";
  }

  protected override with(patch: Partial<TagsInputState>): this {
    return super.with(patch);
  }

  static make(name: string): TagsInput {
    return configured(new TagsInput(baseFieldState(name)));
  }

  /**
   * The character the tags are stored joined by.
   *
   * A tag containing it would come back as two, so one is refused rather than
   * quietly split on the way home — a value that changes shape between being
   * written and being read is worse than one the field would not accept.
   */
  separator(value: string): this {
    return this.with({ separator: value });
  }

  suggestions(value: readonly string[]): this {
    return this.with({ suggestions: [...value] });
  }

  /**
   * A list of tags, each of them something.
   *
   * No closed set: the reader invents the members, which is the whole point of
   * the field. What is refused is what no page could have produced — a value
   * that is not a list, a member that is not text, a blank tag, the same tag
   * twice, and a tag carrying the separator the column joins on.
   */
  override admits(value: unknown): ValueRefusal | undefined {
    if (isUnset(value)) return undefined;
    if (!Array.isArray(value)) return "wrong-shape";
    if (value.some((one) => typeof one !== "string")) return "wrong-shape";

    const tags = value as readonly string[];
    // A tag of spaces is a tag nobody typed on purpose and nothing can show,
    // and one with spaces around it is a tag the box would already have
    // trimmed — the two halves have to agree on what a tag is, or the honest
    // path and the boundary answer differently.
    if (tags.some((one) => one !== one.trim() || one === "")) return "wrong-shape";
    // The same reading a checkbox list and a repeater give their lists: two of
    // one thing are one thing, and left in, the list says otherwise.
    if (new Set(tags).size !== tags.length) return "wrong-shape";

    const separator = this.state.separator;
    if (separator !== undefined && tags.some((one) => one.includes(separator))) {
      return "wrong-shape";
    }
    return undefined;
  }

  /**
   * A list on the way home, whichever shape the column keeps.
   *
   * A column holding a joined string is read back as the list it stands for,
   * so everything above this — the boundary, validation, the renderer — sees
   * one shape and never asks which storage it came from.
   */
  override fromStorage(value: unknown): unknown {
    const separator = this.state.separator;
    if (typeof value === "string" && separator !== undefined) {
      // An empty column is no tags, not one empty tag: splitting `""` gives a
      // list of one blank.
      return value === "" ? [] : tidy(value.split(separator));
    }
    return Array.isArray(value) ? tidy(value) : value;
  }

  override toStorage(value: unknown): unknown {
    const separator = this.state.separator;
    if (separator === undefined || !Array.isArray(value)) return value;
    return value.join(separator);
  }
}

/**
 * What a stored list means, as tags this field would take back.
 *
 * `.separator()` is for a column somebody else filled, so what comes out of one
 * is not what this field would have put in: a trailing separator, two in a row,
 * a space after each comma. Split naively, all three give a tag the boundary
 * refuses — and a form that cannot be saved until the reader notices a blank
 * tag and removes it.
 *
 * Trimmed, blanks dropped, repeats dropped, in the order they were met.
 */
function tidy(values: readonly unknown[]): readonly string[] {
  const out: string[] = [];
  for (const one of values) {
    if (typeof one !== "string") continue;
    const tag = one.trim();
    if (tag !== "" && !out.includes(tag)) out.push(tag);
  }
  return out;
}
