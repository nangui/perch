# PRD 02 — Schema engine (`@perchjs/core`)

**Tier:** v0.1 · **Depends on:** PRD 01 · **Unblocks:** everything else

## 1. Objective

The core. A declarative, composable component tree, **resolved on the server**, that unifies forms, read-only views and layout — exactly like Filament's **Schemas**, which since v4 encompass forms, infolists *and* page structure.

`@perchjs/core` knows **neither Nest, nor Prisma, nor React**. It depends only on the `DataAdapter` interface (PRD 01).

## 2. The target DSL — to be frozen BEFORE any code

This file is deliverable number one for the project. If it is not pleasant to read, no engine will save it.

```ts
@PanelResource({ model: 'User', navigationGroup: 'Access', icon: 'users' })
export class UserResource {
  constructor(private readonly cities: CityService) {}   // ordinary Nest DI

  form() {
    return Schema.make([
      Section.make('Identity').columns(2).schema([
        TextInput.make('name').required(),
        TextInput.make('email').email().unique(),
        Select.make('countryId').relationship('country', 'name').live(),
        Select.make('cityId')
          .options(({ get }) => this.cities.byCountry(get('countryId')))
          .visible(({ get }) => !!get('countryId'))
          .helperText('Pick a country first'),
      ]),
      Section.make('Addresses').collapsible().schema([
        Repeater.make('addresses').relationship().schema([
          TextInput.make('street').required(),
          TextInput.make('zip').maxLength(10),
        ]).minItems(1).maxItems(5),
      ]),
    ]);
  }
}
```

## 3. Object model

### 3.1 Hierarchy

```
Component (abstract)
├── Field (holds state, takes part in validation)
│   ├── TextInput, Select, Toggle, DateTimePicker, …
│   └── ContainerField (has children AND state)
│       ├── Repeater
│       └── Builder
├── Layout (no state, groups children)
│   ├── Schema (root), Grid, Section, Tabs, Wizard, Fieldset
├── Entry (read-only — PRD 09)
└── Prime (static: Text, Image, Icon)
```

### 3.2 Base contract

```ts
abstract class Component {
  static make(name?: string): this;

  // Structure
  schema(children: Component[]): this;
  columnSpan(span: number | 'full' | Responsive): this;
  key(k: string): this;                 // stable identity for the diff

  // Conditional — ALWAYS evaluated on the server
  visible(v: boolean | Resolver<boolean>): this;
  hidden(v: boolean | Resolver<boolean>): this;
  disabled(v: boolean | Resolver<boolean>): this;

  // Metadata
  label(l: string | Resolver<string>): this;
  helperText(t: string | Resolver<string>): this;

  // Extension (PRD 11)
  static configureUsing(fn: (c: this) => void): void;
  extend(fn: (c: this) => void): this;
}
```

### 3.3 The `Resolver` — the key to reactivity

```ts
type Resolver<T> = (ctx: ResolverContext) => T | Promise<T>;

interface ResolverContext {
  get(path: FieldPath): unknown;     // reads another field's state
  set(path: FieldPath, v: unknown): void;
  record?: Row;                      // the record being edited (Edit)
  operation: 'create' | 'edit' | 'view';
  user: unknown;                     // the authenticated user
  livewireOf?: never;                // (reminder: no transport leaking in here)
}
```

**Every** option on a component accepts either a value or a `Resolver`. That is what replaces Livewire: the server re-evaluates the affected resolvers on every state change.

### 3.4 Builder immutability

Every fluent call returns a **clone**. The reason: components are defined once at bootstrap and reused across concurrent requests. A mutable builder means state leaking between users. **That is a security risk, not a style detail.**

## 4. Resolution cycle

The most delicate batch. Sequence for a state change:

```
1. HYDRATE    client state + record → internal state tree
2. APPLY      apply the patch { path, value }
3. HOOKS      run afterStateUpdated() on the changed field
              (may set() other fields → controlled loop, max 5 passes)
4. RESOLVE    re-evaluate visible / disabled / options / label
              ONLY for components whose dependencies changed
5. PRUNE      drop fields that became invisible from the state
6. VALIDATE   validate visible fields only
7. DEHYDRATE  produce { schema, state, errors }
```

**Dependency graph.** At step 4, re-evaluating the whole tree is unacceptable for performance. Each `Resolver` declares its dependencies, either explicitly (`.dependsOn(['countryId'])`) or by **tracing**: on the first call, `get()` is instrumented to record the paths read. Decision: **automatic tracing**, with `.dependsOn()` available as an escape hatch.

**Cycle detection**: if two passes produce the same state, we stop. If 5 passes are exceeded, an explicit error is raised naming the fields involved (not a silent stack overflow).

## 5. Type safety of field paths

The most demanding exercise in the project. Goal:

```ts
TextColumn.make('author.country.name')   // ✅ compiles
TextColumn.make('author.contry.name')    // ❌ compile error
```

Approach: utility types generating the union of valid paths from the generated Prisma types, with a depth limit to avoid an inference explosion.

```ts
type Paths<T, D extends number = 3> = D extends 0 ? never
  : { [K in keyof T & string]:
        T[K] extends object ? K | `${K}.${Paths<T[K], Prev[D]>}` : K
    }[keyof T & string];
```

**Explicit fallback decision**: if compilation cost exceeds **3 s on a 50-model schema**, v0.1 ships with a weakly typed `string` plus runtime validation at bootstrap, and it is hardened in v0.2. Do not block the product on a type-level stunt.

## 6. Validation

- **Source of truth**: the declared schema, not a parallel DTO.
- **Engine**: Zod, generated from the component tree. Chosen over `class-validator` because it composes dynamically at runtime — indispensable when visibility conditions validation.
- **v0.1 rules**: `required`, `email`, `url`, `minLength`, `maxLength`, `min`, `max`, `numeric`, `regex`, `unique` (async, with `ignoreRecord`), `confirmed`, `in`.
- **Custom rules**: `.rule(fn)`, synchronous or async.
- **Invariant**: an invisible field is **never** validated and **never** persisted.

## 7. Acceptance criteria

1. **A1** — a `Select` whose `options` depend on another field updates after a single round trip, with the dependent field hidden while the parent is empty.
2. Targeted re-evaluation: on a 40-field form, changing 1 field re-evaluates ≤ 3 resolvers (measured with a counter).
3. A field hidden by `visible()` disappears from the persisted state.
4. A `Repeater` of 3 rows × 4 fields validates, saves and reloads in full (**A3**).
5. Two concurrent requests on the same resource share no state (concurrency test over 100 parallel requests).
6. An `afterStateUpdated` cycle raises an error naming the fields, in < 5 passes.
7. `@perchjs/core` imports neither `@nestjs/*`, nor `@prisma/client`, nor `react` (checked by a dependency test).

## 8. Out of scope

- Wizards, Builder, Tabs → v0.2/v0.3 (the architecture has to allow them).
- Rendering: this package produces **no** HTML. It produces JSON.
- Persistence: delegated to the `DataAdapter`.
- i18n.

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The traced dependency graph misses a case | High | `.dependsOn()` as an escape hatch + a debug mode listing traced dependencies |
| TypeScript compilation time explodes | Medium | fallback documented in §5 |
| Mutable builders → state leaking across requests | **Critical** | immutability enforced + a concurrency test in CI from day one |
| The DSL diverges into 4 dialects (form/table/infolist/page) | High | one single root `Component` class, like Filament v4's Schemas |
