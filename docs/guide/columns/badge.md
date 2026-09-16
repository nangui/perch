---
title: BadgeColumn
---

# BadgeColumn

A value drawn as a state rather than read as a word.

```ts
import { Schema, BadgeColumn, Table, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make().columns([
      BadgeColumn.make("status").label("Status").color("success"),
    ]);
  }
}
```

Left as text, "active" and "suspended" are two words a reader has to read. As badges they
are two colours they can count down a column without reading at all, which is what a
table of two hundred rows is for.

## A tone per value

```ts
import { BadgeColumn, Table } from "@perchjs/core";

Table.make().columns([
  BadgeColumn.make("status").color((value) =>
    value === "live" ? "success" : value === "archived" ? "danger" : "neutral",
  ),
]);
```

The choice is given the value, not a context holding the record. The thing a status
depends on is the status, and asking for `({ record }) => record?.status` would be asking
you to write the path you already declared.

It is synchronous, which is a limit worth knowing: a tone worth a query is not a tone,
it is a column the record should be carrying.

## There are four tones, and they are not colours

`neutral` · `success` · `warning` · `danger`

Which green the panel uses is the theme's business. A column naming a hex would be the
one thing on the page a theme could not restyle, and a panel whose badges ignore its own
palette looks broken rather than customised.

A choice that returns nothing falls back to `neutral`, so a cell always has a badge to
draw rather than a badge and an exception.
