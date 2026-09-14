/**
 * A colour in an infolist: the patch, and the value that made it.
 *
 * Both, always. A swatch alone says "greenish" and a reader who came for the
 * value has to open a picker to find it; the value alone is a string nobody
 * pictures. Side by side, one answers what it looks like and the other answers
 * what it is.
 *
 * Whatever notation the column keeps is what is shown — a row holding `hsl()`
 * shows `hsl()`. Converting on the way out would be this layer deciding which
 * notation somebody meant, and a value that reads differently from what was
 * stored is a value somebody will paste back wrong.
 */
import { configured } from "../component.js";
import { Entry } from "../entry.js";
import type { EntryState } from "../entry.js";

export interface ColorEntryState extends EntryState {
  readonly copyable?: true;
}

export class ColorEntry extends Entry {
  declare readonly state: ColorEntryState;

  override get type(): string {
    return "ColorEntry";
  }

  protected override with(patch: Partial<ColorEntryState>): this {
    return super.with(patch);
  }

  /** The path into the record: `tint`, or `brand.accent`. */
  static make(name: string): ColorEntry {
    return configured(new ColorEntry({ name, children: [] }));
  }

  /**
   * A control beside the swatch that puts the value on the clipboard.
   *
   * A colour is the value people most often want somewhere else, and the one
   * they are least able to read off a screen and retype without a mistake.
   */
  copyable(): this {
    return this.with({ copyable: true });
  }
}
