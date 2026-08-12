/**
 * `Field` — a component that holds state and is validated.
 *
 * Rules are predicates rather than compiled schemas: the Zod pass belongs to the
 * resolution cycle, and the domain depends on nothing until then.
 */
import type { ComponentState, Resolvable, ResolverContext } from "./component.js";
import type { Option } from "./option.js";
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
export type ValidationRule = (
  value: unknown,
  context: ResolverContext,
) => string | true | Promise<string | true>;

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
    rules.push((value) =>
      typeof value !== "string" || count(value) >= min
        ? true
        : `Must be at least ${String(min)} characters.`,
    );
  }
  if (max !== undefined) {
    rules.push((value) =>
      typeof value !== "string" || count(value) <= max
        ? true
        : `Must be at most ${String(max)} characters.`,
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

  rule(rule: ValidationRule): this {
    return this.with({ rules: [...this.state.rules, rule] });
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
  return { name, children: [], dehydrated: true, rules: [] };
}
