/**
 * `Field` — a component that holds state and is validated.
 *
 * Rules are predicates rather than compiled schemas: the Zod pass belongs to the
 * resolution cycle, and the domain depends on nothing until then.
 */
import type { ComponentState, Resolvable, ResolverContext } from "./component.js";
import type { Option, OptionsInput } from "./option.js";
import { Component } from "./component.js";

/** 400 ms on text, 0 on a select, a toggle or a date. */
export interface LiveConfig {
  readonly debounce: number;
  readonly onBlur: boolean;
}

export interface StateHookContext extends ResolverContext {
  readonly value: unknown;
}

export type StateHook = (context: StateHookContext) => void | Promise<void>;

/** `true` when valid, otherwise the message to show. */
/**
 * Which declared limit a rule checks.
 *
 * A closed set, and only what the framework itself writes. A rule an author
 * passed to `.rule()` has no kind and cannot be renamed by one — they wrote the
 * message, so there is nothing to override.
 */
export type RuleKind =
  | "required"
  | "minLength"
  | "maxLength"
  | "step"
  | "email"
  | "url"
  | "numeric"
  | "mask"
  | "minDate"
  | "maxDate"
  | "minItems"
  | "maxItems";

/**
 * A check, and what it is checking, where the framework wrote it.
 *
 * A callable with a property rather than an object with a `check`: every rule
 * that exists is already a function, and the six fields that declare their own
 * would all have had to be rewritten to say the same thing a different way.
 */
export interface ValidationRule {
  (value: unknown, context: ResolverContext): string | true | Promise<string | true>;
  readonly kind?: RuleKind;
}

/**
 * A framework rule, tagged with the limit it is about.
 *
 * Wrapped rather than tagged in place: `Object.assign` would write the property
 * onto the function it was handed, so a check held anywhere but the call would
 * carry whichever kind tagged it last — and the type says `readonly`, which is
 * a promise worth keeping rather than a comment.
 */
export function ruleFor(
  kind: RuleKind,
  check: (
    value: unknown,
    context: ResolverContext,
  ) => string | true | Promise<string | true>,
): ValidationRule {
  return Object.assign(
    (value: unknown, context: ResolverContext) => check(value, context),
    { kind },
  );
}

export type StateTransform = (value: unknown, context: ResolverContext) => unknown;

export interface FieldState extends ComponentState {
  readonly required?: Resolvable<boolean>;
  readonly defaultValue?: Resolvable<unknown>;
  readonly placeholder?: Resolvable<string>;
  readonly readOnly?: Resolvable<boolean>;
  /** Absent means the field never triggers a round trip on its own. */
  readonly live?: LiveConfig;
  readonly dehydrated: boolean;
  /**
   * A blank value must not be written. Kept out of `dehydrateStateUsing` so a
   * caller setting their own transform cannot drop the protection.
   */
  readonly dehydrateWhenEmpty?: false;
  readonly afterStateUpdated?: StateHook;
  readonly dehydrateStateUsing?: StateTransform;
  readonly formatStateUsing?: StateTransform;
  readonly rules: readonly ValidationRule[];
  /**
   * What to say instead, per limit.
   *
   * Only the framework's own messages can be replaced: a rule an author passed
   * to `.rule()` carries the words they wrote, and there is nothing to override
   * in it. A key naming a limit this field does not have stops the boot, the
   * way every other declaration nothing acts on does.
   */
  readonly validationMessages?: Readonly<Partial<Record<RuleKind, string>>>;
  /**
   * The label beside the control rather than above it.
   *
   * Its own name because it is its own decision: Filament v4 split this from
   * laying a field's *choices* out in a row after years of one `inline()`
   * meaning both, and a reader of this API should never have to remember which
   * field they are on to know what they asked for.
   */
  readonly inlineLabel: boolean;
}

/** Why a value was turned away, as opposed to the path that carried it. */
export type ValueRefusal = "wrong-shape" | "undeclared-value";

/** Nothing at all. A field that holds several says so for itself. */
export function isUnset(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

export function isScalarValue(value: unknown): boolean {
  return (
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
  );
}

/**
 * The rules a declared length implies, shared by every field that holds text.
 *
 * Counted in graphemes, which is what the person typing counts. `"👋".length`
 * is 2 and a family emoji is seven code points; a limit that calls one
 * character seven is a limit nobody can reason about, and the counter under the
 * box would disagree with the error under that.
 */
export function lengthRules(
  min: number | undefined,
  max: number | undefined,
): readonly ValidationRule[] {
  const rules: ValidationRule[] = [];
  if (min !== undefined) {
    rules.push(
      ruleFor("minLength", (value) =>
        typeof value !== "string" || count(value) >= min
          ? true
          : `Must be at least ${String(min)} characters.`,
      ),
    );
  }
  if (max !== undefined) {
    rules.push(
      ruleFor("maxLength", (value) =>
        typeof value !== "string" || count(value) <= max
          ? true
          : `Must be at most ${String(max)} characters.`,
      ),
    );
  }
  return rules;
}

// Built once: a segmenter per keystroke per field is not free.
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function count(text: string): number {
  // The iterator is lazy, so this walks the string once and holds nothing.
  let seen = 0;
  const walk = GRAPHEMES.segment(text)[Symbol.iterator]();
  while (!walk.next().done) seen += 1;
  return seen;
}

export abstract class Field extends Component {
  declare readonly state: FieldState;

  protected override with(patch: Partial<FieldState>): this {
    return super.with(patch);
  }

  /** Overridden by field types that commit immediately. */
  protected get defaultDebounce(): number {
    return 400;
  }

  override get name(): string {
    return this.state.name ?? "";
  }

  /**
   * A stored value, in the shape the form works in.
   *
   * The page hands the whole row in as state, so a column arrives as whatever
   * the driver returns — a `Date` for a timestamp. The cycle has to see one
   * shape either way, or a resolver reading the path gets a `Date` on the
   * first render and a string after the first keystroke.
   *
   * Applied once, on the way in, and idempotent: a value that is already in
   * the form's shape passes through, because the second round trip carries
   * what the first one produced.
   */
  fromStorage(value: unknown): unknown {
    return value;
  }

  /** The reverse, on the way to the database. */
  toStorage(value: unknown): unknown {
    return value;
  }

  /**
   * Whether a client may set this field at all.
   *
   * A structural answer, not a flag: `disabled` and `readOnly` are resolvable,
   * so a field whose safety depended on one could be unlocked by the resolver
   * that was supposed to lock it. A hidden field is the exact place tampering
   * is worth attempting, and "the reader cannot see it" is not the same
   * sentence as "the reader cannot set it".
   */
  get acceptsClient(): boolean {
    return true;
  }

  /**
   * The list this field offers, if it offers one.
   *
   * Asked of the field for the same reason `admits` is: the cycle resolved
   * options for one class by name, so a second field declaring `.options()`
   * had them silently never resolved — the list crossed nothing, the boundary
   * saw no declaration, and every value a reader picked was refused.
   */
  get declaredOptions(): Resolvable<OptionsInput> | undefined {
    return undefined;
  }

  /**
   * The rules the field's own declaration implies.
   *
   * `.maxLength(500)` is a promise, and until now it was one the browser was
   * asked to keep: the number crossed the wire as a hint and nothing on the
   * server looked at it again. State is authoritative here, so a limit that was
   * declared is checked here.
   *
   * Read off the state rather than appended by the setter, so declaring a
   * second limit replaces the first instead of leaving both to fire.
   */
  get declaredRules(): readonly ValidationRule[] {
    return [];
  }

  /**
   * Whether this field can hold this value at all.
   *
   * Asked at the trust boundary, of the field, because the answer is the
   * field's own: a checkbox holds two values, a select holds the ones it
   * declared, and text holds anything that is text. Deciding it from outside
   * meant a chain of `instanceof` that every new field type had to be added to
   * — and that nothing would fail to remind anyone about.
   *
   * Clearing is always allowed. It is the one thing no declaration names.
   *
   * `options` are the resolved ones, which is why they arrive rather than
   * being read off the state: a list can come from a resolver.
   */
  admits(
    value: unknown,
    options: readonly Option[] | undefined,
  ): ValueRefusal | undefined {
    // Named and unread: the signature belongs to the fields that do read it,
    // and text is anything that is text.
    void options;
    if (isUnset(value)) return undefined;
    return isScalarValue(value) ? undefined : "wrong-shape";
  }

  /**
   * Whether this value counts as filled in, for the `required` rule alone.
   *
   * Asked of the field rather than decided centrally, because the answer is
   * not the same everywhere: `false` is a value a numeric field holds and a
   * checkbox does not, and `[]` is a selection nobody made.
   */
  satisfiesRequired(value: unknown): boolean {
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && value !== "";
  }

  required(value: Resolvable<boolean> = true): this {
    return this.with({ required: value });
  }

  default(value: Resolvable<unknown>): this {
    return this.with({ defaultValue: value });
  }

  placeholder(value: Resolvable<string>): this {
    return this.with({ placeholder: value });
  }

  readOnly(value: Resolvable<boolean> = true): this {
    return this.with({ readOnly: value });
  }

  live(config: { readonly debounce?: number; readonly onBlur?: boolean } = {}): this {
    return this.with({
      live: {
        debounce: config.debounce ?? this.defaultDebounce,
        onBlur: config.onBlur ?? false,
      },
    });
  }

  afterStateUpdated(hook: StateHook): this {
    return this.with({ afterStateUpdated: hook });
  }

  /** `false` keeps the field in the form and out of the write. */
  dehydrated(value = true): this {
    return this.with({ dehydrated: value });
  }

  dehydrateStateUsing(transform: StateTransform): this {
    return this.with({ dehydrateStateUsing: transform });
  }

  formatStateUsing(transform: StateTransform): this {
    return this.with({ formatStateUsing: transform });
  }

  /** What to say when a declared limit is not met, instead of the default. */
  validationMessages(messages: Readonly<Partial<Record<RuleKind, string>>>): this {
    return this.with({ validationMessages: { ...messages } });
  }

  rule(rule: ValidationRule): this {
    return this.with({ rules: [...this.state.rules, rule] });
  }

  /** The label beside the control. Never about how choices are laid out. */
  inlineLabel(value = true): this {
    return this.with({ inlineLabel: value });
  }

  rules(rules: readonly ValidationRule[]): this {
    return this.with({ rules: [...this.state.rules, ...rules] });
  }
}

export interface ResolvedFlags {
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly readOnly: boolean;
}

/**
 * Stage 5: may this path be taken from the client at all? Silently is the
 * operative word — "this field is read-only" tells an attacker which fields
 * exist and which are protected.
 */
export function acceptsClientState(flags: ResolvedFlags): boolean {
  return flags.visible && !flags.disabled && !flags.readOnly;
}

/**
 * Whether a resolved value reaches the database. Not the same predicate as
 * `acceptsClientState`: `disabled` only bars state coming *from* the client, so
 * a value the server computed for a disabled field is still written, while
 * `readOnly` is "not persisted" and bars the write too.
 */
export function isDehydrated(
  field: Field,
  flags: ResolvedFlags,
  value: unknown,
): boolean {
  if (!flags.visible || flags.readOnly || !field.state.dehydrated) return false;
  if (field.state.dehydrateWhenEmpty === false && isBlank(value)) return false;
  return true;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

export function baseFieldState(name: string): FieldState {
  return { name, children: [], dehydrated: true, rules: [], inlineLabel: false };
}
