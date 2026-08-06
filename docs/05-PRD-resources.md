# PRD 05 — Resources & CRUD pages

**Tier:** v0.1 → v0.3 · **Depends on:** PRD 01, 02, 03, 04

## 1. Objective

Reproduce what the Filament documentation calls *"the heart of your application"*: resources are CRUD UIs for your models. Filament generates three pages out of the box — **List** (paginated table), **Create** (form) and **Edit** (form) — plus an optional read-only **View** page, and automatically registers the sidebar item as soon as a resource is created.

## 2. Anatomy of a resource

```ts
@PanelResource({
  model: 'Post',
  slug: 'posts',                    // default: kebab-case plural of the model
  label: 'Article',
  pluralLabel: 'Articles',
  recordTitle: 'title',             // default: inferred (PRD 01 §3.2)
  navigationGroup: 'Content',
  navigationSort: 10,
  icon: 'document-text',
  softDeletes: true,
})
export class PostResource {
  form(): Schema { }               // Create + Edit
  table(): Table { }               // List
  infolist?(): Schema { }          // View        (v0.2)
  relations?(): RelationManager[] { } //           (v0.2)
  can?: Authorization;             // PRD 04 §5.2
  pages?(): PageOverride[] { }     //             (v0.2)
  navigationBadge?(): Promise<string | number>;
  globalSearch?: GlobalSearchConfig; //           (v0.3)
}
```

One single `form()` method serves both Create and Edit, told apart by `ctx.operation` — as in Filament. One `form()` per operation is possible but not required.

## 3. Generated pages

| Page | Route | Tier | Content |
|---|---|---|---|
| **List** | `{path}/posts` | v0.1 | table + header actions (Create) |
| **Create** | `{path}/posts/create` | v0.1 | form + Save / Save & create another |
| **Edit** | `{path}/posts/:id/edit` | v0.1 | form + Save + actions (Delete, Replicate, …) |
| **View** | `{path}/posts/:id` | v0.2 | read-only infolist |

### 3.1 Lifecycle (hooks)

Extension points, indispensable for real cases and for plugins:

```ts
mutateFormDataBeforeCreate(data)   // v0.1
mutateFormDataBeforeSave(data)     // v0.1
mutateFormDataBeforeFill(data)     // v0.1  (Edit: DB → form)
beforeCreate() / afterCreate(record)
beforeSave()   / afterSave(record)
beforeDelete() / afterDelete(record)
handleRecordCreation(data)         // v0.2 — replace persistence entirely
handleRecordUpdate(record, data)   // v0.2
```

`handleRecord*` is the escape hatch that allows plugging in a business service or an event bus instead of writing to the database directly. Without it, the tool is unusable in an app that has domain logic.

### 3.2 Redirect after creation

Configurable **at panel level** (index / view / edit), overridable per resource — taken directly from an addition in Filament v4.

## 4. Deletion & soft deletes (v0.2)

| Behavior | Detail |
|---|---|
| Delete | confirmation mandatory by default |
| Bulk delete | confirmation + count |
| Soft delete | detected through `deletedAt` or declared; adds a ternary filter *with/without deleted* |
| Restore / Force delete | dedicated actions, separate authorization |
| FK constraints | a constraint error surfaces as a **readable notification**, not a 500 |

## 5. Relation managers (v0.2)

Managing children from the parent page — the feature that separates a real admin from a toy CRUD.

```ts
relations() {
  return [
    RelationManager.make('comments')
      .table(t => t.columns([TextColumn.make('body'), TextColumn.make('author.name')]))
      .form(s => s.schema([Textarea.make('body').required()]))
      .actions([EditAction.make(), DeleteAction.make()])
      .headerActions([CreateAction.make()]),
    RelationManager.make('tags').attachable(),   // n-n: attach/detach
  ];
}
```

**A functional distinction to respect**: `Repeater` (PRD 06) edits children *inside* the parent form, in one transaction. `RelationManager` manages them *alongside*, with its own pagination and its own actions. Both are needed; conflating them is the classic mistake.

Rendering: tabs under the form (default), or a free placement in v0.3 once page structure becomes a schema.

## 6. Nested resources (v0.3)

Filament v4 supports them natively: declare a resource as a child of another, and the framework handles routing and breadcrumbs.

```ts
@PanelResource({ model: 'Product', parent: { resource: CategoryResource, relation: 'category' } })
```

Routes: `{path}/categories/:parentId/products/:id/edit`. Scoping to the parent is automatic. No navigation item of its own.

## 7. Singular resources (v0.3)

A single instance, no List page: Settings, organization profile, billing configuration. One route, a direct form.

## 8. Global search (v0.3)

Search across every resource, with a command palette (⌘K).

```ts
globalSearch = {
  attributes: ['title', 'excerpt'],
  resultTitle: (r) => r.title,
  resultDetails: (r) => ({ Author: r.author.name }),
  actions: [ /* quick actions from the result */ ],
};
```

**Performance constraint**: Filament had to add an option to disable splitting the search term into words, which collapsed on large datasets. → decision: **no splitting by default**, opt-in.

## 9. Acceptance criteria

1. A 15-line resource produces a working List/Create/Edit with navigation.
2. `mutateFormDataBeforeCreate` allows hashing a password before persistence.
3. `handleRecordCreation` allows routing creation to a business service without the tool touching the database.
4. **A2** — a table with a relation column + filter + bulk delete + confirmation.
5. **A3** — a Repeater on `addresses` creates, updates and deletes children in one transaction.
6. A relation manager paginates 500 children without degrading the parent page.
7. An FK constraint violation produces a readable error notification.
8. A resource with no declared `table()` generates a default table from the IR (PRD 01) — usable immediately.

## 10. Out of scope

- Record versioning / history.
- Approval workflows.
- Audit log (plugin candidate, v2+).
- Bulk import (v0.3, PRD 08).
- Resolving concurrent-edit conflicts (showing a warning is enough for v1).

## 11. Risks

| Risk | Mitigation |
|---|---|
| The Repeater / RelationManager pair confuses users | an explicit decision tree in the docs, from the Resources page onward |
| The hooks do not cover a real case → a fork | `handleRecord*` as a total escape hatch from v0.2 |
| The default table is unusable (too many columns) | capped at 6 inferred columns, prioritized: title, uniques, relations, dates |
| Nested resources blow up routing complexity | deferred to v0.3, after simple routing has stabilized |
