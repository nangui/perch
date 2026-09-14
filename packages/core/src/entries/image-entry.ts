/**
 * A picture in an infolist, by the key the row holds.
 *
 * What a row stores is a key on a disk, not an address, and only the host can
 * turn one into the other — it knows the disk and it is what signs for a
 * bucket. So the address is minted on the server and read there too: a signed
 * URL is exactly the kind of value nobody should hand to an `src` unexamined,
 * and the row it came out of vouches for nothing.
 *
 * A host that cannot answer means no picture rather than a broken one. An
 * `<img>` pointing at something nobody read is worse than an empty space,
 * because the space is honest.
 *
 * Without a disk the value is already an address and is read as one — the same
 * reading, with the minting skipped.
 */
import { configured } from "../component.js";
import { Entry } from "../entry.js";
import type { EntryState } from "../entry.js";

export interface ImageEntryState extends EntryState {
  /** Which disk the stored key belongs to. Absent means the value is an address. */
  readonly disk?: string;
  readonly circular?: true;
  readonly stacked?: true;
  /** The side, in pixels. A picture with no size given is given one by the panel. */
  readonly size?: number;
}

export class ImageEntry extends Entry {
  declare readonly state: ImageEntryState;

  override get type(): string {
    return "ImageEntry";
  }

  protected override with(patch: Partial<ImageEntryState>): this {
    return super.with(patch);
  }

  /** The path into the record: `avatar`, or `author.avatar`. */
  static make(name: string): ImageEntry {
    return configured(new ImageEntry({ name, children: [] }));
  }

  /** The disk the keys in this path were written to. */
  disk(name: string): this {
    return this.with({ disk: name });
  }

  /** A circle rather than a square, for a face rather than a logo. */
  circular(): this {
    return this.with({ circular: true });
  }

  /**
   * Several pictures overlapping, rather than in a row.
   *
   * For a path holding a list. It says "these belong together and there are
   * this many" in the width of about two, which is what a row of avatars is
   * for; a line of twelve says the same thing and takes the page.
   */
  stacked(): this {
    return this.with({ stacked: true });
  }

  size(pixels: number): this {
    return this.with({ size: pixels });
  }
}
