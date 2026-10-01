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

## What the footer says

```ts
import { Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Order" })
export class OrdersResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("reference")]);
  }

  table() {
    return Table.make().columns([
      TextColumn.make("reference").summarise("count"),
      TextColumn.make("total").money("EUR").summarise("sum", "avg"),
      TextColumn.make("placedAt").dateTime().summarise("range"),
    ]);
  }
}
```

Four words, and no fifth: `count`, `sum`, `avg`, `range`. A column may ask for several,
and they draw as lines under it in the order it named them.

The numbers are worked out by the database over **every row a filter left**, not over the
page. A total of the twenty-five rows on screen is a number that moves when somebody turns
a page, which is not what a total means. Narrow the list with a filter or a search and the
footer narrows with it, because the footer and the table above it are one question asked
twice and there is one declaration of which rows.

Every footer in a table costs **one query**, however many columns asked. That is what the
aggregate on the data port takes several named functions for.

`count` names its column and counts the rows that hold a value in it. The count of rows is
already on the response as its total, so a second copy of it under a column would be one
number arriving twice with nothing to say which was which.

A total of a money column reads as money, through the same formatting a cell uses, so an
amount cannot read one way in a row and another underneath it. A count of that same column
does not: a count is a number of rows, and run through a money rule it would read as an
amount and mean a tally.

**No value reads as no value, never as nought.** A sum over rows that hold nothing in that
column has no total, and printing 0 would state one nobody worked out. The footer shows a
dash. It is the one place that difference cannot be taken back, because the person looking
at a footer is reading the number rather than passing it on.

What a column cannot bear is refused at boot, naming the column: a total of a date, or of
a column on another model reached through a relation. The second is a different feature,
an aggregate per row over that row's related rows, and it is not in this release.

A column a reader may not have is never asked about. Four readings of a filtered total
narrow one salary down, so a column `.visible()` turns away for somebody has no footer
worked out for them at all, rather than one that is worked out and then not drawn. A
column the reader takes off the table takes its footer with it too.

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

A table can offer its own header actions here as well, by the name they were declared
with:

```ts
import { CreateAction, Table, TextColumn } from "@perchjs/core";

Table.make()
  .columns([TextColumn.make("title")])
  .headerActions([CreateAction.make().name("create")])
  .emptyState({
    heading: "No posts yet",
    description: "The first one takes a minute.",
    actions: ["create"],
  });
```

Named rather than declared again, and that is the whole of it: an action declared twice
is authorised twice, and the second place is the one somebody forgets. The empty state
can only re-offer what the header already offers this reader, so a reader who may not
create gets no button because a table asked for one.

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
