---
title: IconColumn
---

# IconColumn

A mark instead of a word, for the column a reader scans rather than reads.

```ts
import { Schema, IconColumn, Table, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make().columns([
      IconColumn.make("published").label("Live").boolean(),
    ]);
  }
}
```

## `boolean()` draws a check or a cross

From whether the value is truthy. Without it the column draws the mark the value names,
which is for a stored icon name rather than a flag.

## The icon column and the toggle column hold the same value

They differ in intent, not in type. `IconColumn` says what a row **is**;
[`ToggleColumn`](./toggle) changes it. A table of flags nobody may change wants the icon,
and a reader who may change them is spared the round trip through an edit page.

Reach for the icon by default. A cell that writes is a cell somebody can write by
mistake.
