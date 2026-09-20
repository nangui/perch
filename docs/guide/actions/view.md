---
title: ViewAction
---

# ViewAction

The button that shows a record's infolist.

```ts
import {
  Schema,
  Table,
  TextColumn,
  TextEntry,
  TextInput,
  ViewAction,
} from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  infolist() {
    return Schema.make([TextEntry.make("title")]);
  }

  table() {
    return Table.make()
      .columns([TextColumn.make("title")])
      .actions([ViewAction.make()]);
  }
}
```

The `infolist()` is not optional here. It is what the button opens, and a resource that
offers one without saying how a record reads is refused at boot rather than left to draw
a button that answers 404. That holds for both forms below.

## Or in place, without leaving the list

```ts
import { Table, TextColumn, ViewAction } from "@perchjs/core";

Table.make()
  .columns([TextColumn.make("title")])
  .actions([ViewAction.make().inModal()]);
```

Neither is more correct. A page has an address you can send somebody and room for a long
infolist. A modal keeps the reader on the list they were reading, which is what they want
when the question is "which one is this again".

The page is the default because it is the one that works with no client at all.

## There is no second declaration for what the modal shows

It is the same infolist the View page draws, resolved the same way against the same
policy. A resource that has said how a record reads has said it once.
