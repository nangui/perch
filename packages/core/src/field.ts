/**
 * `Field` — a component that holds state and is validated.
 *
 * Rules are predicates rather than compiled schemas: the Zod pass belongs to the
 * resolution cycle, and the domain depends on nothing until then.
 */
import type { ComponentState, Resolvable, ResolverContext } from "./component.js";
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
