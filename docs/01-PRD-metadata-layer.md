# PRD 01 — Metadata layer (`@perchjs/prisma-generator`, `@perchjs/prisma`)

**Tier:** v0.1 · **Depends on:** nothing · **Unblocks:** PRD 02, 05, 06, 07, 10

## 1. Objective

Turn the Prisma schema into an **intermediate representation (IR)** that the schema engine consumes, without `@perchjs/core` ever knowing about Prisma.

This is the equivalent of what Eloquent gives Filament for free: knowing which fields exist, of what type, with which relations and which constraints. Prisma allows it through its **DMMF** (Data Model Meta Format), which a generator receives while `prisma generate` runs.

## 2. Why this is the first batch

Everything else depends on it: smart defaults (`TextInput.make('email')` infers `type=email`, `maxLength`, `required`), code generation, resolving `'author.name'`, relation filters. It is also the most mechanical batch — which makes it the best one to start with.

## 3. Functional specification

### 3.1 The IR

```ts
interface ModelMeta {
  name: string;              // 'User'
  dbName: string;            // 'users'
  primaryKey: FieldMeta;
  fields: FieldMeta[];
  relations: RelationMeta[];
  uniqueConstraints: string[][];
  hasSoftDelete: boolean;    // detected by convention (deletedAt) or by config
}

interface FieldMeta {
  name: string;
  kind: 'scalar' | 'enum' | 'json';
  type: 'String' | 'Int' | 'Float' | 'Decimal' | 'Boolean'
      | 'DateTime' | 'Json' | 'Bytes' | 'BigInt';
  isRequired: boolean;
  isList: boolean;
  isId: boolean;
  isUnique: boolean;
  isReadOnly: boolean;       // @default(autoincrement()), @updatedAt
  hasDefault: boolean;
  default?: unknown;
  enumValues?: string[];
  maxLength?: number;        // from @db.VarChar(n)
  documentation?: string;    // the /// comment becomes the helperText
}

interface RelationMeta {
  name: string;              // 'author'
  type: 'one' | 'many';
  targetModel: string;
  foreignKeyFields: string[];// ['authorId']
  referencedFields: string[];
  isRequired: boolean;
  onDelete?: 'Cascade' | 'SetNull' | 'Restrict' | 'NoAction';
}
```

### 3.2 Field inference (the real contribution)

Mapping table from IR to default field. This is what makes generation useful rather than dumb.

**A name is matched word by word, not by substring.** `websiteUrl` is split into `website` and `url` before any rule is consulted. A substring test both misses `websiteUrl`, where `url` sits at a camelCase boundary, and fires on `season` for a rule about `on`. Both happened.

| Metadata | Inferred field | Automatic options |
|---|---|---|
| `String` | `TextInput` | `maxLength` from `@db.VarChar` |
| `String` + a word in `email`, `mail` | `TextInput` | `.email()` |
| `String` + a word in `password`, `passwd`, `pwd` | `TextInput` | `.password()`, `.dehydrated(false if empty)` |
| `String` + a word in `url`, `uri`, `link`, `href`, `website`, `homepage` | `TextInput` | `.url()` |
| `String` + `@db.Text` | `Textarea` | — |
| `Int` / `Float` / `Decimal` / `BigInt` | `TextInput` | `.numeric()`, precision from `@db.Decimal` |
| `Boolean` | `Toggle` | — |
| `DateTime` | `DateTimePicker` | `.date()` alone if a word is `date`, `on`, `day` or `birthday` |
| `enum` | `Select` | `.options()` from `enumValues` |
| `Json` | `KeyValue` (v0.2) | falls back to `CodeEditor` |
| `one` relation | `Select` | `.relationship(name, labelField)` |
| `many` relation | *excluded from the form* | offered as a relation manager |
| `isRequired && !hasDefault` | — | `.required()` |
| `isUnique` | — | `.unique(ignoreRecord: true)` |
| `isReadOnly` or `isId` | *excluded from the form* | visible in the table and the infolist |
| a relation's foreign key | *not offered at all* | the relation above already writes that column, and offering both is two controls for one column |
| `deletedAt` on a model with `hasSoftDelete` | *excluded from the form* | a date picker on it would delete the row (ADR 0014) |
| non-empty `documentation` | — | `.helperText(documentation)` |

Every exclusion but one carries its reason, so the generated resource can show the field commented out — more useful than pretending the column does not exist. The exception is the foreign key, which is not returned at all: it is not an excluded field but a column the relation above already represents.

**Label field detection** on a target model, in priority order: `name` → `title` → `label` → `email` → `slug` → first unique `String` → primary key.

### 3.3 Relation path resolution

`'author.country.name'` has to resolve into:

- a compile-time validation (type level, see PRD 02 §5)
- a Prisma loading plan: `{ include: { author: { include: { country: true } } } }`
- value access that does not blow up on an intermediate `null`

Maximum depth: **3 levels** in v0.1. Beyond that → an explicit error.

### 3.4 Execution layer

A `PrismaDataAdapter` implementing the interface `core` defines:

```ts
interface DataAdapter {
  meta(model: string): ModelMeta;
  findMany(q: Query): Promise<{ rows: Row[]; total: number }>;
  findOne(model: string, id: unknown, include?: IncludePlan): Promise<Row | null>;
  create(model: string, data: WriteTree): Promise<Row>;
  update(model: string, id: unknown, data: WriteTree): Promise<Row>;
  delete(model: string, ids: unknown[]): Promise<number>;
  transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T>;
}
```

`WriteTree` supports nested writes (Prisma's `create`/`connect`/`update`/`delete`) — which is what makes the Repeater of acceptance criterion A3 possible.

## 4. Technical constraints

- **Loading the DMMF**: a Prisma generator receives it as `options.dmmf` ([ADR 0012](adr/0012-ir-at-build-time.md)). Not `Prisma.dmmf` from the generated client, which since Prisma 7 carries only names and types; no reading of the `.prisma` file (fragile), no SQL parsing.
- **Cost**: the DMMF is read **once, at `prisma generate`**. The IR is a checked-in module, so bootstrap imports it and the hot path never sees it.
- **Version resilience**: the DMMF is not a stable public API of Prisma. → access is isolated in **a single file**, `dmmf-reader.ts` in `@perchjs/prisma-generator`, with a contract test that drives a real `prisma generate` and fails loudly if the shape changes. Document the supported range of Prisma versions.
- **N+1**: every relation column must produce an `include`, never one query per row. A regression test counting SQL queries.

## 5. Acceptance criteria

1. On a Prisma schema of 12 models with 1-1, 1-n and n-n relations, `meta()` returns the complete IR without error.
2. `TextInput.make('email')` on `User` automatically produces `required`, `email`, `maxLength=255` with no configuration.
3. `TextColumn.make('author.country.name')` on a 50-row table generates **one single** SQL query.
4. A field path that does not exist fails at TypeScript **compile time**.
5. A `WriteTree` with 3 nested children runs in a single transaction and rolls back entirely if the third fails.
6. Bootstrap on 50 models takes < 200 ms.

## 6. Out of scope

- Drizzle, TypeORM, Mongoose (the `DataAdapter` interface makes them possible; we write none of them).
- MySQL, SQLite, MongoDB.
- Migrations (that is Prisma's job).
- Polymorphic fields.
- Deep self-referential relations (> 3 levels).

## 7. Risks

| Risk | Mitigation |
|---|---|
| The DMMF changes between Prisma versions | isolation in one file + a contract test run against a real `prisma generate` + documented version range. Prisma 7 is what proved this necessary: the earlier test compared the fixture with nothing, and the break went unnoticed for a whole major version |
| Inference too "magic", surprises the user | every inference is overridable; a `strict` mode disables name-based inference |
| Prisma nested writes too limited for A3 | prototype A3 **during** this batch, not after |
