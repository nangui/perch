---
title: CreateAction
---

# CreateAction

The button that goes to the Create page.

```ts
import { CreateAction, Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make()
      .columns([TextColumn.make("title")])
      .actions([CreateAction.make().label("New post")]);
  }
}
```

## It is a link, and that is the whole design

Pressing it asks the server for nothing. The browser follows an address and the Create
page decides for itself who may see it, the way it would if the reader had typed the
address.

So there is no callback to write and nothing to authorize on the action: a link is
followed, not run, and the action route is never asked about it. Guarding the button
would be guarding one of two doors.

## It takes no callback

None of the ready-made actions do. They are not inert for that: the framework knows what
each one means, which is the reason to use them rather than write them again.
