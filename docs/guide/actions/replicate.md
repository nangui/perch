---
title: ReplicateAction
---

# ReplicateAction

Makes a copy of a record.

```ts
import { ReplicateAction, Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make()
      .columns([TextColumn.make("title")])
      .actions([
        ReplicateAction.make().excludeAttributes(["slug", "createdAt"]),
      ]);
  }
}
```

## Everything comes across, which is the point and the trap

A column the database keeps unique is copied into a value that already exists, and the
second copy is a constraint error rather than a row. `.excludeAttributes()` is how you
say which columns those are.

You are not left to remember: the boot reads the schema and refuses a replicate that
copies a column the model keeps unique, naming it.

Constraints made of several columns count too, and there one exclusion is enough. Leave
either half behind and the pair becomes a pair nothing holds yet, so the copy is free to
take the other.

## A last word before it is written

```ts
import { ReplicateAction, Table, TextColumn } from "@perchjs/core";

Table.make()
  .columns([TextColumn.make("title")])
  .actions([
    ReplicateAction.make()
      .excludeAttributes(["slug"])
      .beforeReplicaSaved((replica) => ({ ...replica, title: `Copy of ${String(replica["title"])}` })),
  ]);
```

For what a copy cannot simply carry: a title that should say it is a copy, a status that
should start over.

## It asks `create`, not `edit`

It makes a row. A reader allowed to change what is already there is not thereby allowed
to add to it.
