# PRD 09 — Infolists, widgets & dashboard

**Tier:** v0.2 → v0.3 · **Depends on:** PRD 02, 03, 05

## 1. Objective

Two building blocks Filament lists among its six core ones.

**Infolists** — *"rendering read-only record views, with structured layouts and custom formatting"*. Use: detail pages, side panels, inspection interfaces.

**Widgets** — *"surfacing metrics, aggregates, charts and recent activity with data-driven components"*. At Filament, every widget is technically a Livewire component, and therefore fully interactive.

## 2. Infolists (v0.2)

### 2.1 Positioning

An infolist is **not** a disabled form. It is a distinct component tree, optimized for reading: rich formatting, dense layouts, no editable state, no validation. It reuses the same root `Component` (PRD 02) but an `Entry` sub-hierarchy.

**Architectural gain**: the layouts (`Section`, `Grid`, `Tabs`) are shared with forms. One single implementation.

### 2.2 API

```ts
infolist() {
  return Schema.make([
    Section.make('Order').columns(3).schema([
      TextEntry.make('number').label('No.').copyable(),
      TextEntry.make('status').badge().color(s => STATUS_COLORS[s]),
      TextEntry.make('total').money('EUR'),
      TextEntry.make('customer.email').label('Customer').url(r => `mailto:${r.customer.email}`),
      TextEntry.make('createdAt').dateTime(),
    ]),
    Section.make('Line items').schema([
      RepeatableEntry.make('items').schema([
        TextEntry.make('product.name'),
        TextEntry.make('quantity'),
        TextEntry.make('unitPrice').money('EUR'),
      ]),
    ]),
  ]);
}
```

### 2.3 Entry catalog

| Entry | Tier | Options |
|---|---|---|
| `TextEntry` | v0.2 | `.badge()` `.color()` `.icon()` `.money()` `.dateTime()` `.numeric()` `.copyable()` `.limit()` `.listWithLineBreaks()` `.html()` `.markdown()` `.url()` `.placeholder()` |
| `IconEntry` | v0.2 | `.boolean()` `.icons()` `.colors()` |
| `ImageEntry` | v0.2 | `.circular()` `.stacked()` `.size()` |
| `ColorEntry` | v0.2 | `.copyable()` |
| `KeyValueEntry` | v0.2 | for Json fields |
| `CodeEntry` | v0.3 | syntax highlighting |
| `RepeatableEntry` | v0.2 | hasMany relations, read-only |
| `Custom entries` | v0.2 | the same contract as custom fields (PRD 11) |

**Invariants**:

- An infolist **never** persists anything.
- An entry hidden by authorization must not appear in the JSON payload — hiding it on the client is a data leak.
- Relation loading is planned as a single query (`include`), as it is for tables.

### 2.4 Usage contexts

A resource's View page · the modal of a `ViewAction` · a table's side panel · inside a relation manager · inside a custom page.

## 3. Widgets (v0.3)

### 3.1 Types

| Widget | Tier | Notes |
|---|---|---|
| `StatsWidget` | v0.3 | metric cards: value, description, icon, color, trend, sparkline |
| `ChartWidget` | v0.3 | line, bar, pie, doughnut, area — through a single charting library |
| `TableWidget` | v0.3 | reuses the Table builder (PRD 07), no parallel code |
| `CustomWidget` | v0.3 | React escape hatch |

```ts
@PanelWidget({ sort: 1, columnSpan: 2, pollingInterval: 30_000 })
export class SalesStats extends StatsWidget {
  async stats() {
    const [views, sales, change] = await this.analytics.summary();
    return [
      Stat.make('Unique views', views).icon('eye'),
      Stat.make('Sales', sales)
        .color(change >= 0 ? 'success' : 'danger')
        .descriptionIcon(change >= 0 ? 'trending-up' : 'trending-down')
        .description(`${Math.abs(change)}%`),
    ];
  }
}
```

### 3.2 Behaviors

| Capability | Tier |
|---|---|
| Placement on the dashboard (order, responsive `columnSpan`) | v0.3 |
| Widgets on resource pages (List / Edit / View) | v0.3 |
| Polling / automatic refresh | v0.3 |
| A global dashboard filter (period) propagated to the widgets | v0.3 |
| Per-widget authorization | v0.3 |
| Per-widget cache (TTL) | v0.3 |
| Lazy loading (a widget does not block the page render) | v0.3 |
| **End-user-configurable drag-and-drop dashboards** | **Out of scope — commercial plugin candidate** |

That last point is deliberate: Filament sells precisely that feature as a paid official plugin (*Custom Dashboards*). It is an excellent indicator of what has market value. See PRD 11.

### 3.3 Performance

A dashboard is the slowest screen in a badly designed admin: 8 widgets means 8 potentially heavy aggregates.

**Rules:**

- Each widget is loaded **independently and in parallel**, after the chrome has rendered. The dashboard appears immediately with skeletons.
- A slow widget does not block the others; a failed widget shows a local error, never a blank screen.
- Budget: each widget < 500 ms, dashboard interactive < 400 ms.
- A default cache is recommended (TTL 60 s) and documented.

## 4. Acceptance criteria

1. A resource's View page renders from `infolist()` in ≤ 2 SQL queries, relations included.
2. An unauthorized entry is absent from the JSON payload (verified by network inspection).
3. `RepeatableEntry` displays 20 child rows with no N+1 query.
4. The layouts (`Section`, `Grid`, `Tabs`) behave identically in a form and in an infolist — **one single implementation**, tested in both contexts.
5. A 6-widget dashboard renders in < 400 ms with skeletons, each widget filling in independently.
6. A widget that throws shows a localized error and does not prevent the other 5 from rendering.
7. `TableWidget` reuses the Table builder with no code duplication (verified by review).

## 5. Out of scope

- End-user-configurable dashboards (drag and drop) → a plugin.
- Report builder / BI.
- Exporting a dashboard to PDF.
- Real-time widgets over WebSocket (v0.3 at the earliest, coupled to broadcast notifications).
- Geographic map widgets → a plugin.

## 6. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The dashboard becomes the slowest screen in the panel | High | parallel, lazy loading enforced + a per-widget budget |
| Infolists duplicate the forms code | Medium | shared root `Component` (PRD 02); architecture review before merge |
| Entries hidden on the client only → a leak | **High** | server-side payload filtering + a network inspection test |
| The charting library choice weighs down the bundle | Low | one library, lazily loaded with the widgets |
| Widget aggregates ignore tenant scoping | **Critical** | scoping at `DataAdapter` level (PRD 04 §8), never in the widget |
