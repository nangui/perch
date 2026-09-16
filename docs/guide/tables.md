---
title: Tables
---

# Tables

A resource's `table()` is what its List page draws, and what `/records` answers.

```ts
import { Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make()
      .columns([
        TextColumn.make("title").label("Title").searchable().sortable(),
        TextColumn.make("author.name").label("Author"),
      ])
      .defaultSort("title");
  }
}
```

A resource without a table still lists. It gets no columns and the narrow default sort,
which is honest rather than useful.

## Cells are drawn flat

Worth knowing before anything else, because it shapes what a column can be.

There is no React component per cell, with hooks and context of its own. There is one
memoised render function **per column type**, and a table of a thousand cells is a
thousand calls to eleven functions. Filament had to rewrite its whole table rendering for
this reason, and this framework starts where that rewrite ended.

It is not a rule anybody has to remember either. A cell renderer's type is not a
component type, so none of them can call a hook: the signature refuses it, rather than a
reviewer noticing.

What follows is that a column declares data and the renderer decides pixels. A column
that needs its own drawing is a custom column type, registered once under its own key,
not a closure smuggled into a cell.

## Relations cost nothing extra

```ts
import { Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make().columns([
      // One `include` on the page's single query, not one query per row.
      TextColumn.make("author.name").label("Author"),
      TextColumn.make("author.team.name").label("Team"),
    ]);
  }
}
```

A dotted path reaches through a relation, and every relation a column names becomes part
of the page's one query. That is not a convention anybody has to keep: the query counter
is a blocking test.

## Sorting, searching, taking a column off

```ts
import { Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make()
      .columns([
        TextColumn.make("title").searchable().sortable(),
        // Offered for removal. A column declared plainly is one its author
        // meant, and offering to remove it would make every table's shape a
        // suggestion.
        TextColumn.make("excerpt").toggleable(),
      ])
      .defaultSort("title", "desc");
  }
}
```

`.searchable()` decides which columns a search term touches, and that is an authorization
decision rather than a convenience: a match on a column nobody displays answers a question
about it, one letter at a time. So the paths are named here rather than left to the
adapter.

What a reader takes off is remembered in their browser, along with how many rows they
asked for. Not in the address, which would hand somebody else's arrangement to whoever
opened the link, and not on the server, which would follow a person between machines and
needs a store this framework does not have.

## Filters

```ts
import {
  DateRangeFilter,
  Schema,
  SelectFilter,
  Table,
  TernaryFilter,
  TextColumn,
  TextInput,
} from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make()
      .columns([TextColumn.make("title")])
      .filters([
        SelectFilter.make("status").label("Status").options([
          { value: "draft", label: "Draft" },
          { value: "live", label: "Live" },
        ]),
        TernaryFilter.make("featured").label("Featured"),
        DateRangeFilter.make("publishedAt").label("Published"),
      ]);
  }
}
```

The filters are `SelectFilter`, `TextFilter`, `TernaryFilter`, `DateRangeFilter`,
`NumberRangeFilter`, `TrashedFilter` and `SchemaFilter`.

A filter the table did not declare is dropped in silence when it arrives. That is the
boundary working, and it is why a test that filters should assert on what came back
rather than trusting that it asked.

The boot checks that a filter has a column it can actually ask about. A date range over a
text column is refused there rather than becoming a 500 under a reader, because the two
adapters disagree about it: Prisma refuses a `Date` against a `String` column and an
in-memory one compares what it can and returns nothing. Either way the line that was
wrong is not the one that says so.

## Actions

Three places, and the difference is what they act on.

```ts
import { Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make()
      .columns([TextColumn.make("title")])
      // On one row.
      .actions([])
      // Above the table, on none of them.
      .headerActions([])
      // On whatever the reader ticked.
      .bulkActions([]);
  }
}
```

Actions have [their own section](/resources). What matters here is that a button is never
the protection: whatever a policy hides is refused again when the action runs.

## When there is nothing to show

```ts
import { Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make()
      .columns([TextColumn.make("title")])
      .emptyState({
        heading: "No posts yet",
        description: "The first one you write will appear here.",
        icon: "plus",
      });
  }
}
```

Without one the table says so in the plainest words it has. With one it can say why there
is nothing yet and what to do about it, which is the difference between an empty page and
a page that looks broken.

## On a narrow screen

The table stops being a grid and becomes a stack: each row is a block, each cell a line.
The same cells, drawn by the same functions, laid out down instead of across.

The headings are moved off the page rather than removed, because they are what a screen
reader announces each cell by. Taking them away would take that from the readers who
depend on it most.

## The columns

Read only:
[TextColumn](./columns/text) ·
[BadgeColumn](./columns/badge) ·
[IconColumn](./columns/icon) ·
[ImageColumn](./columns/image) ·
[AvatarColumn](./columns/avatar) ·
[ColorColumn](./columns/color) ·
[GaugeColumn](./columns/gauge)

Written from the cell:
[ToggleColumn](./columns/toggle) ·
[CheckboxColumn](./columns/checkbox) ·
[TextInputColumn](./columns/text-input) ·
[SelectColumn](./columns/select)

The last four are editable in place: the cell is a control, and writing one is a save of
that one field through the form. Every rule the value has to keep is the form's, asked
where it is declared. A table that checked its own way would be a second boundary.
