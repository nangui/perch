---
title: RestoreAction
---

# RestoreAction

Lifts the mark a delete put on a row.

```ts
import { RestoreAction, Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make()
      .columns([TextColumn.make("title")])
      .actions([RestoreAction.make()]);
  }
}
```

## It does not ask first, on purpose

Restoring is the one operation here that undoes rather than decides. A reader who did not
mean it deletes again, and nothing was lost in between. Asking first would be asking
about the wrong direction.

## It asks the `restore` policy

Its own, not `edit` and not `delete`. Bringing a row back is a different question from
either.
