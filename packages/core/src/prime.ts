/**
 * Static content in a schema: a paragraph, a picture, a mark.
 *
 * `Text`, `Image` and `Icon` each shadow something a browser already defines,
 * and are kept anyway. The alternative is qualifying them the way `TextInput`,
 * `TextEntry` and `TextColumn` are qualified — and those carry a qualifier
 * because there are three of them, where here there is one of each. A published
 * name is expensive to change, so this one is a decision rather than an
 * accident.
 *
 * The fourth branch of the tree, beside a field, a layout and an entry. It
 * holds no state, names no column and reads no record: what it shows was
 * written into the declaration, and the cycle resolves it the way it resolves
 * every other line of prose.
 *
 * Not a `Placeholder`, which is a field. A placeholder sits in the field grid
 * with a label above it and help below it, and is a computed answer among the
 * controls. This is the sentence *between* two sections, or the diagram above a
 * form — content the reader looks at rather than a reading of the record.
 *
 * Extending `Component` rather than `Field` is the whole design, for the reason
 * an entry does it: everything a field carries stays out of reach rather than
 * being switched off, and the three files that must stay boring key on
 * `instanceof Field`.
 */
import type { ComponentState, Resolvable } from "./component.js";
import { Component, configured } from "./component.js";
import type { EntryTone } from "./entries/text-entry.js";
import type { IconName } from "./icon.js";

export interface PrimeState extends ComponentState {
  /** What it says, or what it points at. Resolved every pass. */
  readonly content?: Resolvable<string>;
  readonly tone?: EntryTone;
  /** What a reader who cannot see the picture is told instead. */
  readonly alt?: string;
}

export abstract class Prime extends Component {
  declare readonly state: PrimeState;

  protected override with(patch: Partial<PrimeState>): this {
    return super.with(patch);
  }

  /**
   * What it says, or what it points at.
   *
   * Set through the builder rather than handed to the constructor, which takes
   * the base's state and would need an assertion to take this one — and an
   * assertion is a claim nothing checks.
   */
  content(value: Resolvable<string>): this {
    return this.with({ content: value });
  }
}

/**
 * A line of prose between the controls.
 *
 * Resolvable, because the sentence a reader needs usually depends on what is in
 * front of them — the same reasoning a callout's description follows.
 */
export class Text extends Prime {
  override get type(): string {
    return "Text";
  }

  static make(content: Resolvable<string>): Text {
    return configured(new Text({ children: [] })).content(content);
  }

  /** Which of the panel's four. The set a badge, an entry and a callout use. */
  tone(value: EntryTone): this {
    return this.with({ tone: value });
  }
}

/**
 * A picture, by the address the declaration gives it.
 *
 * The address goes through the same check an entry's link does, on the server,
 * for the same reason: the source accepts a resolver, so it can be built from a
 * stored value, and a stored value does not reach an attribute unchecked. One
 * that does not survive the check is no picture rather than an `<img>` pointing
 * somewhere nobody read.
 */
export class Image extends Prime {
  override get type(): string {
    return "Image";
  }

  /**
   * The alternative comes first because it is not optional.
   *
   * A picture with nothing to say instead of it is one a reader who cannot see
   * it is simply not told about — and asking for it second is asking for it to
   * be forgotten. An empty string is a real answer: it says the picture is
   * decoration and a screen reader should skip it.
   */
  static make(alt: string, source: Resolvable<string>): Image {
    return configured(new Image({ children: [] }))
      .content(source)
      .alt(alt);
  }

  alt(value: string): this {
    return this.with({ alt: value });
  }
}

export interface IconState extends PrimeState {
  /** Which mark, by name. One of the set the panel has drawings for. */
  readonly icon?: IconName;
}

/**
 * A mark, and nothing a screen reader will read.
 *
 * By name, the way every other mark in the panel is asked for: the name is
 * resolved to a drawing the renderer ships, so a mark standing on its own is
 * the same shape at the same weight as the one beside a section's title.
 *
 * Under `icon` and not under `content`, which is where the character used to
 * ride. `content` is a `Prime`'s own word — resolvable, and never read against
 * anything — while the boot reads `icon` on every component there is. A mark
 * kept apart from that walk was the one mark nothing could refuse.
 *
 * Decoration by definition: a mark carrying meaning of its own would need words
 * beside it, and those words are a `Text`.
 */
export class Icon extends Prime {
  declare readonly state: IconState;

  override get type(): string {
    return "Icon";
  }

  protected override with(patch: Partial<IconState>): this {
    return super.with(patch);
  }

  static make(name: IconName): Icon {
    return configured(new Icon({ children: [] })).with({ icon: name });
  }

  tone(value: EntryTone): this {
    return this.with({ tone: value });
  }
}
