# PRD 07 — Table builder

**Tier:** v0.1 → v0.3 · **Depends on:** PRD 01, 02, 03

## 1. Objective

Take up what Filament describes as *"browsing and filtering large datasets with powerful columns, actions and bulk operations"*. The table is the first thing an end user sees: it is where the product's perceived quality is judged.

## 2. A lesson to absorb before writing a line

Filament v3 rendered its cells with deeply nested Blade components, which collapsed on large tables. v4 **completely rewrote** cell rendering for that reason.

**Design consequence, non-negotiable:** cell rendering is **flat**. No React component per cell carrying context and hooks. One registry per column type, one render function, memoization per column and not per cell. This constraint is structural — you do not retrofit it.

## 3. API

```ts
table() {
  return Table.make()
    .query(q => q.where({ published: true }))     // base scope
    .columns([
      TextColumn.make('title').searchable().sortable(),
      TextColumn.make('author.name').label('Author').sortable(),
      IconColumn.make('isPriority').boolean(),
      TextColumn.make('status').badge().color(s => STATUS_COLORS[s]),
      TextColumn.make('createdAt').dateTime().sortable().toggleable(hiddenByDefault: true),
    ])
    .filters([
      SelectFilter.make('status').options(Status),
      SelectFilter.make('authorId').relationship('author', 'name').searchable(),
      TernaryFilter.make('published'),
      DateRangeFilter.make('createdAt'),
    ])
    .actions([ViewAction.make(), EditAction.make(), DeleteAction.make()])
    .bulkActions([DeleteBulkAction.make(), ExportBulkAction.make()])
    .headerActions([CreateAction.make()])
    .defaultSort('createdAt', 'desc')
    .paginated([10, 25, 50, 100])
    .searchPlaceholder('Search for an article…')
    .emptyState(e => e.heading('No articles').description('Create the first one.'));
}
```

## 4. Columns

| Column | Tier | Key options |
|---|---|---|
| `TextColumn` | v0.1 | `.searchable()` `.sortable()` `.badge()` `.color()` `.icon()` `.limit()` `.tooltip()` `.money()` `.dateTime()` `.numeric()` `.copyable()` `.wrap()` `.listWithLineBreaks()` |
| `IconColumn` | v0.1 | `.boolean()` `.icons()` `.colors()` |
| `ImageColumn` | v0.2 | `.circular()` `.stacked()` `.size()` `.limit()` |
| `ColorColumn` | v0.2 | `.copyable()` |
| `SelectColumn` | v0.2 | inline editing |
| `ToggleColumn` | v0.2 | inline editing |
| `TextInputColumn` | v0.2 | inline editing |
| `CheckboxColumn` | v0.2 | inline editing |

**Cross-cutting options**: `.label()` `.alignment()` `.width()` `.toggleable()` `.visible()` `.extraAttributes()` `.state(Resolver)` `.default()` `.placeholder()`.

**Aggregate columns** (v0.3): `.counts('comments')`, `.sum('items', 'total')`, `.avg()`, `.max()` — translated into subqueries, never into an application loop.

**Inline editing** (v0.2): this is a write from a table. It has to go through the same authorization and the same validation as the form. The classic trap is bypassing the policies. Forbidden.

## 5. Filters

| Filter | Tier |
|---|---|
| `SelectFilter` (+ `.relationship()` `.multiple()` `.searchable()`) | v0.1 |
| `TextFilter` | v0.1 |
| `TernaryFilter` (yes / no / all — including soft deletes) | v0.2 |
| `DateRangeFilter` | v0.2 |
| `NumberRangeFilter` | v0.2 |
| `Filter.make().schema([...])` — a custom filter with a free schema | v0.2 |
| `QueryBuilder` (nested AND/OR conditions) | v0.3 |

Behaviors: filters persisted in the URL (shareable, reloadable), a badge with the number of active filters, `.deferFilters()` (apply on click rather than on every keystroke), active-filter indicators removable one by one.

## 6. Search, sorting, pagination

- **Search**: global across `searchable()` columns, or per column (`isIndividual`). Searching on a relation is supported. **No splitting of the term into words by default** — Filament had to add that option for performance reasons; we take the fast default.
- **Sorting**: single-column in v0.1; multi-column in v0.3. Filament v4 also sorts by primary key as a tiebreaker, to guarantee a stable order between pages — **take up that behavior**, it is a correctness fix, not a preference.
- **Pagination**: offset in v0.1; cursor in v0.3 for very large volumes. `perPage` persisted per user (v0.2).

## 7. Selection & bulk actions

- Page selection, selection of the whole filtered result (careful: do not load 100k IDs into memory — on "select all", pass the **predicate**, not the list of IDs).
- Counter, deselection, floating action bar.
- Bulk actions with confirmation, progress for long batches (v0.3, through a queue).

## 8. Advanced features

| Feature | Tier |
|---|---|
| Responsive layout (split, stack, columns hidden on mobile) | v0.2 |
| Configurable empty state (heading, description, icon, actions) | v0.2 |
| Summaries (footer aggregates: count, sum, avg, range) | v0.3 |
| Grouping rows (collapsible groups with counts) | v0.3 |
| Drag-and-drop reordering (an order column) | v0.3 |
| Custom data (non-ORM source: external API, in-memory array) | v0.3 |
| Toggleable columns persisted per user | v0.2 |
| CSV export of the filtered result | v0.3 (PRD 08) |

**Ecosystem note**: some high-end features (user-saved views, quick filters, multi-column sorting, view management) are sold as **commercial plugins** in the Filament ecosystem. → natural candidates for our own plugin layer (PRD 11), **not** for the core.

## 9. Performance budget

| Scenario | v0.1 budget | v1.0 budget |
|---|---|---|
| 10k rows, 8 columns of which 2 are relations, page of 25 | 300 ms | 150 ms |
| Sorting on an indexed column | 200 ms | 100 ms |
| Global search across 3 columns | 400 ms | 200 ms |
| 100k rows, cursor pagination | — | 200 ms |
| SQL queries per page render | **≤ 3** (count + rows + filters) | ≤ 3 |

The SQL query counter is a regression test in CI, not a good intention.

## 10. Acceptance criteria

1. **A2** — relation column + select filter + bulk delete + confirmation modal, on a real resource.
2. 10,000 rows: first render < 300 ms, ≤ 3 SQL queries, no per-row query.
3. Filters and sorting persisted in the URL: reloading the page restores the exact state; the URL is shareable.
4. Two consecutive pages never show the same row twice (stable order guaranteed by the tiebreaker sort on the primary key).
5. "Select all" over 100,000 filtered rows does not load 100,000 IDs on the client.
6. Inline editing on an unauthorized row is refused on the server.
7. A table with no declared `columns()` is generated from the IR (6 columns maximum) and is immediately usable.

## 11. Out of scope

- Kanban / calendar / map views (plugin candidates).
- User-saved views (commercial plugin candidate).
- Pivot tables.
- Spreadsheet-style bulk cell editing.
- Virtual scrolling (pagination is enough for v1).

## 12. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Nested cell rendering → Filament v3's performance wall | **High** | flat rendering enforced from the first commit; budget measured in CI |
| N+1 on relation columns | High | an SQL query counter in the tests |
| Complex filters generating unindexed SQL | Medium | a development-mode warning on full scans |
| "Select all" blows up memory | Medium | pass a predicate, never a list of IDs |
