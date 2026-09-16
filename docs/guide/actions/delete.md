---
title: DeleteAction
---

# DeleteAction

Removes a record, or hides it where the model soft-deletes.

```ts
import { DeleteAction, Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make()
      .columns([TextColumn.make("title")])
      .actions([DeleteAction.make()]);
  }
}
```

## It already confirms, and it is already destructive

Both are on before you touch it: the button is styled as dangerous and the reader is
asked before anything happens. You do not add `.requiresConfirmation()` or `.danger()` to
this one, and you would have to say so explicitly to take either off.

## What it does depends on the model

On a soft-deleting model it puts a mark on the row and [`RestoreAction`](./restore) lifts
it. On any other it is gone. The route knows which, so the resource does not declare it
twice.

For the operation nothing undoes, see [`ForceDeleteAction`](./force-delete).

## It asks the `delete` policy

Not `edit`. Every other built-in that runs asks its own question too, and a custom action
asks `edit` unless you authorize it yourself.
