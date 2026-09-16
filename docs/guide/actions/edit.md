---
title: EditAction
---

# EditAction

The button that goes to a record's Edit page.

```ts
import { EditAction, Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make()
      .columns([TextColumn.make("title")])
      .actions([EditAction.make()]);
  }
}
```

## A page, not an address

The action names which of the record's pages it leads to, and the panel builds the
address. Where a panel is mounted and how a row is keyed are the panel's business, not
something a resource should be spelling out and keeping in step.

Like [`CreateAction`](./create) it is followed rather than run, so the Edit page answers
for who may open it.
