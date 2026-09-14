/**
 * `KeyValue` — the pairs in a `Json` column, edited as pairs.
 *
 * What it holds and what the column holds are deliberately not the same shape.
 * The column keeps an object, because that is what a `Json` column of settings
 * or metadata already holds and what everything else reading it expects. The
 * form keeps an ordered list of pairs, because a key is a thing the reader
 * types into: editing one *as an object key* means deleting and re-adding an
 * entry on every keystroke, which loses the row's place and the cursor with it.
 *
 * So the field converts. Above it, everything sees pairs; in the database, an
 * object; and neither half has to know about the other.
 *
 * What it is for is a flat object of text — settings, metadata, labels. It can
 * show a column holding more than that, but only as the JSON each entry reads
 * as, and a save writes that text back.
 *
 * The boundary judges the shape and the conversion judges the keys. A blank
 * key, a typed space and the same name twice are all things a reader produces
 * on the way to a form that makes sense, and stage 5 refuses in silence — so
 * refusing any of them there would take the rest of their work with it.
 */
import { configured } from "../component.js";
import { pairsOf } from "../pairs.js";
import type { FieldState, ValueRefusal } from "../field.js";
import { baseFieldState, Field, isUnset } from "../field.js";

export type { Pair } from "../pairs.js";

export interface KeyValueState extends FieldState {
  /** What the first column is called. "Key" unless told otherwise. */
  readonly keyLabel?: string;
  readonly valueLabel?: string;
}

export class KeyValue extends Field {
  declare readonly state: KeyValueState;

  override get type(): string {
    return "KeyValue";
  }

  protected override with(patch: Partial<KeyValueState>): this {
    return super.with(patch);
  }

  static make(name: string): KeyValue {
    return configured(new KeyValue(baseFieldState(name)));
  }

  keyLabel(value: string): this {
    return this.with({ keyLabel: value });
  }

  valueLabel(value: string): this {
    return this.with({ valueLabel: value });
  }

  /**
   * A list of pairs, each of them two strings. Nothing about the keys.
   *
   * What is refused is what no page could have produced: a value that is not a
   * list, and a row that is not two strings. A blank key, a key with space
   * around it and the same key twice are all things this page produces — the
   * first is what pressing "Add" gives, the second is a typed space, the third
   * is two rows a reader can see — and a refusal here is silent, so refusing
   * one of them throws away everything else they typed in the field without a
   * word. The keys are settled where the object is built instead.
   *
   * A blank value is a value: "this key, deliberately empty" is a thing a
   * settings table says, and the key is what names the row.
   */
  override admits(value: unknown): ValueRefusal | undefined {
    if (isUnset(value)) return undefined;
    if (!Array.isArray(value)) return "wrong-shape";

    for (const row of value) {
      if (!Array.isArray(row) || row.length !== 2) return "wrong-shape";
      const [key, held] = row as readonly unknown[];
      if (typeof key !== "string" || typeof held !== "string") return "wrong-shape";
    }
    return undefined;
  }

  /**
   * The column's object, as the pairs it stands for.
   *
   * The reading itself is in `pairsOf`, shared with the infolist that shows
   * the same columns.
   */
  override fromStorage(value: unknown): unknown {
    // Not a plain object: left alone rather than half-converted. The boundary
    // will refuse it, and refusing something recognisable beats writing
    // something invented.
    return pairsOf(value) ?? value;
  }

  /**
   * The pairs, as the object the column keeps.
   *
   * Where the two disagree about what a key is, this is what settles it. A key
   * is trimmed, a row whose key is then blank is not an entry and is left out,
   * and two rows of one name are one entry — the last of them, which is what
   * an object says and what the reader is looking at.
   */
  override toStorage(value: unknown): unknown {
    if (!Array.isArray(value)) return value;

    // Without a prototype, because `__proto__` is a key a settings column
    // holds and assigning it on a plain object calls a setter instead of
    // making a property: the pair would go missing between here and the row.
    const out = Object.create(null) as Record<string, string>;
    for (const row of value) {
      if (!Array.isArray(row) || row.length !== 2) continue;
      const [key, held] = row as readonly unknown[];
      if (typeof key !== "string" || typeof held !== "string") continue;
      const name = key.trim();
      if (name !== "") out[name] = held;
    }
    return out;
  }
}
