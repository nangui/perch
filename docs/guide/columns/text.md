---
title: TextColumn
---

# TextColumn

A value read as the words it is. The column most tables are mostly made of.

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
      TextColumn.make("title").label("Title").searchable().sortable(),
      TextColumn.make("author.name").label("Author"),
    ]);
  }
}
```

## Sorting and searching are declared, not offered

Neither is on by default, and neither is something the client may ask for unasked.
Ordering by a column reveals the order of its values, and asking whether any row matches
`@acme.com` answers a question about values nobody displayed. Both are oracles, so the
server accepts them only where a column said so.

That is why `.sortable()` and `.searchable()` read as permissions rather than as
decorations. The button appearing in the heading is the visible half; the server agreeing
to act on it is the half that matters.

## A relation costs nothing extra

`author.name` is a path through a relation, and it does not become a query per row. Every
relation a column reads is folded into one `include` on the page's single query, so a
table of two hundred rows showing an author each is still one query.

## Taking a column off

```ts
import { Table, TextColumn } from "@perchjs/core";

Table.make().columns([
  TextColumn.make("title").sortable(),
  TextColumn.make("createdAt").label("Created").toggleable(true),
]);
```

`toggleable()` lets the reader turn a column off. The argument is whether it starts off:
`true` is for the column worth having and not worth the width, such as a created-at
beside six others. It starts hidden and a reader turns it on, rather than starting visible and being
turned off by everybody.
