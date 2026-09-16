---
title: ForceDeleteAction
---

# ForceDeleteAction

Destroys the rows for good, marked or not.

```ts
import { ForceDeleteAction, Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make()
      .columns([TextColumn.make("title")])
      .actions([ForceDeleteAction.make()]);
  }
}
```

## The one operation the panel offers that nothing undoes

[`DeleteAction`](./delete) on a soft-deleting model hides a row and a restore brings it
back. This leaves nothing to bring back. That is why it confirms by default, and why it
is styled as dangerous by default.

## It asks `forceDelete`, which is not `delete`

Deliberately a separate policy. Being allowed to hide a row is not being allowed to
destroy it, and a panel where one implied the other would be a panel where the safe
operation quietly granted the unsafe one.
