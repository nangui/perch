/**
 * The declarative component tree. One root class for forms, infolists and
 * layout, so the DSL cannot split into four dialects.
 *
 * Everything conditional is a `Resolver` evaluated on the server, so the
 * browser is never the place a rule is decided.
 */

export type Operation = "create" | "edit" | "view";

export interface ResolverContext {
  /**
   * Properties, not methods: the DSL destructures them —
   * `.options(({ get }) => …)` — and a destructured method loses its receiver.
   */
  readonly get: (path: string) => unknown;
  readonly set: (path: string, value: unknown) => void;
  readonly record?: Readonly<Record<string, unknown>>;
  readonly operation: Operation;
  readonly user: unknown;
}

export type Resolver<T> = (context: ResolverContext) => T | Promise<T>;

export type Resolvable<T> = T | Resolver<T>;

export function isResolver<T>(value: Resolvable<T>): value is Resolver<T> {
  return typeof value === "function";
}

export type ColumnSpan = number | "full";

/** All of it in one object, so cloning cannot forget a property. */
export interface ComponentState {
  readonly name?: string;
  readonly children: readonly Component[];
  readonly visible?: Resolvable<boolean>;
  readonly disabled?: Resolvable<boolean>;
  readonly label?: Resolvable<string>;
  readonly helperText?: Resolvable<string>;
  /**
   * A word beside the label rather than under the control.
   *
   * The line under a field belongs to the error, and a hint that lived there
   * would be replaced by one — the reader loses the instruction exactly when
   * they have got something wrong. So it sits at the other end of the label
   * row, where both can be true at once.
   */
  readonly hint?: Resolvable<string>;
  /** A glyph before the hint. Decoration: the hint carries the meaning. */
  readonly hintIcon?: string;
  /**
   * Attributes the declaration puts on the control.
   *
   * Narrow on purpose. This is the one option in the set that reaches the DOM
   * as a name the author chose, and the names a browser treats as instructions
   * live in the same namespace as the ones it treats as description: `on*` runs
   * code, `style` is a stylesheet, and `href`, `src` and `formaction` are
   * addresses. A resource is server code and therefore trusted — but a
   * declaration that reads a request to build an attribute is one refactor away
   * from being written, and the refusal belongs where the attribute is made
   * rather than in whoever remembers.
   *
   * So: `data-*` and `aria-*`, plus `title` and `role`. Everything else is
   * refused at boot, by name, with the name said out loud.
   */
  readonly extraAttributes?: Readonly<Record<string, string>>;
  /** Whether the browser puts the cursor here on arrival. One per form. */
  readonly autofocus?: boolean;
  readonly columnSpan?: ColumnSpan;
  readonly key?: string;
}

const CONFIGURATORS = new Map<unknown, ((component: never) => void)[]>();

export abstract class Component {
  readonly state: ComponentState;

  /**
   * The discriminator the wire format and the renderer registry key on.
   * Declared rather than read from `constructor.name`, which a minifier
   * rewrites, and which a plugin could not choose (extension point E3).
   */
  abstract get type(): string;

  /**
   * Which of its own state keys cross to the browser as `props`.
   *
   * Empty unless a component says otherwise. The ones this package ships are
   * listed together where a guard can read them in one place — a list that goes
   * quiet when a line gets long is worse than none — and this is how anything
   * else says what it needs: a component nobody here wrote can carry its own
   * configuration to its own renderer without editing that list.
   *
   * Static values only, which the serialiser enforces rather than trusts: a
   * resolver still a function when it gets there is not part of the wire.
   */
  get sends(): readonly string[] {
    return [];
  }

  /** Public because `configureUsing` needs the class constructible. */
  constructor(state: ComponentState) {
    this.state = state;
  }

  /**
   * Components are built once at bootstrap and reused across concurrent
   * requests, so a builder that mutates in place leaks one user's state into
   * another's response. Nothing here assigns to `this`.
   */
  protected with(patch: Partial<ComponentState>): this {
    const Ctor = this.constructor as new (state: ComponentState) => this;
    return new Ctor({ ...this.state, ...patch });
  }

  get name(): string | undefined {
    return this.state.name;
  }

  get children(): readonly Component[] {
    return this.state.children;
  }

  schema(children: readonly Component[]): this {
    return this.with({ children: [...children] });
  }

  columnSpan(span: ColumnSpan): this {
    return this.with({ columnSpan: span });
  }

  /** Stable identity for the client diff, independent of position. */
  key(value: string): this {
    return this.with({ key: value });
  }

  visible(value: Resolvable<boolean> = true): this {
    return this.with({ visible: value });
  }

  /** Negated here, so only one flag is ever stored. */
  hidden(value: Resolvable<boolean> = true): this {
    if (!isResolver(value)) return this.with({ visible: !value });
    return this.with({ visible: async (context) => !(await value(context)) });
  }

  disabled(value: Resolvable<boolean> = true): this {
    return this.with({ disabled: value });
  }

  label(value: Resolvable<string>): this {
    return this.with({ label: value });
  }

  helperText(value: Resolvable<string>): this {
    return this.with({ helperText: value });
  }

  hint(value: Resolvable<string>): this {
    return this.with({ hint: value });
  }

  hintIcon(glyph: string): this {
    return this.with({ hintIcon: glyph });
  }

  extraAttributes(attributes: Readonly<Record<string, string>>): this {
    return this.with({ extraAttributes: { ...attributes } });
  }

  autofocus(value = true): this {
    return this.with({ autofocus: value });
  }

  extend(fn: (component: this) => this): this {
    return fn(this);
  }

  /** Extension point E1. Bootstrap-time only. */
  static configureUsing<C extends typeof Component>(
    this: C,
    fn: (component: InstanceType<C>) => InstanceType<C>,
  ): void {
    const existing = CONFIGURATORS.get(this) ?? [];
    CONFIGURATORS.set(this, [...existing, fn]);
  }

  /** Test seam: otherwise configuration leaks between suites. */
  static resetConfigurators(): void {
    CONFIGURATORS.clear();
  }
}

/** Applies configurators base class first, so the most specific one wins. */
export function configured<T extends Component>(component: T): T {
  const chain: unknown[] = [];
  for (
    let ctor: unknown = component.constructor;
    typeof ctor === "function" && ctor !== Object;
    ctor = Object.getPrototypeOf(ctor)
  ) {
    chain.unshift(ctor);
  }

  let result = component;
  for (const ctor of chain) {
    for (const fn of CONFIGURATORS.get(ctor) ?? []) {
      result = (fn as unknown as (c: T) => T)(result);
    }
  }
  return result;
}
