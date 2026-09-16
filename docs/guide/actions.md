---
title: Actions
---

# Actions

A button that does something to a record, or to a selection of them.

```ts
import type { Row } from "@perchjs/core";
import { Action, Notification, Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

class ArchiveAction extends Action {
  static make(): ArchiveAction {
    return new ArchiveAction({});
  }
  override get type(): string {
    return "ArchiveAction";
  }
  protected override with(state: ConstructorParameters<typeof Action>[0]): this {
    return new ArchiveAction(state) as this;
  }
}

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make()
      .columns([TextColumn.make("title")])
      .actions([
        ArchiveAction.make()
          .name("archive")
          .label("Archive")
          .action((record: Row) => {
            void record;
            return Notification.make().title("Post archived").success();
          }),
      ]);
  }
}
```

## One callback, however many records

An action's callback takes **one record**, even when fifty were ticked.

The framework owns the loop and the transaction, so an author who never thought about
bulk already has a correct bulk action. There is no `BulkAction` class and there will not
be one: the difference between a row action and a bulk action is where the button is, not
what the code does.

There are three lists, and what differs is what the button acts on: `actions()` on one
row, `headerActions()` above the table on none of them, and `bulkActions()` on whatever
the reader ticked.

**The same action goes in two of them.** Not a copy: the same instance, which is how one
action comes to be offered in two places and go through one piece of code.

```ts
import { Action, Notification, Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

class ArchiveAction extends Action {
  static make(): ArchiveAction {
    return new ArchiveAction({});
  }
  override get type(): string {
    return "ArchiveAction";
  }
  protected override with(state: ConstructorParameters<typeof Action>[0]): this {
    return new ArchiveAction(state) as this;
  }
}

const archive = ArchiveAction.make()
  .label("Archive")
  .action(() => Notification.make().title("Archived").success());

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make()
      .columns([TextColumn.make("title")])
      .actions([archive])
      .bulkActions([archive]);
  }
}
```

## Names

A request calls an action by name, and the name defaults to its type. That is enough
until a table declares two of the same kind, at which point one of them could never be
reached, so the boot refuses it and says which name is doubled.

Two lists holding the **same instance** is not that. It is one action offered twice, and
the refusal knows the difference.

```ts
import { Action, Notification } from "@perchjs/core";

class ArchiveAction extends Action {
  static make(): ArchiveAction {
    return new ArchiveAction({});
  }
  override get type(): string {
    return "ArchiveAction";
  }
  protected override with(state: ConstructorParameters<typeof Action>[0]): this {
    return new ArchiveAction(state) as this;
  }
}

// Two of one kind, so each says what it is called.
export const soft = ArchiveAction.make().name("archive").label("Archive");
export const hard = ArchiveAction.make().name("archive-forever").label("Archive for good");
```

## The built-in ones

Eight of them, and none takes a callback of yours. The framework knows what each one
means, which is why they are worth using rather than writing again.

Three navigate. They are links to pages that already exist, so going there is all they
do and the page answers for who may open it:
[CreateAction](./actions/create) ·
[EditAction](./actions/edit) ·
[ViewAction](./actions/view)

Five act. They carry no callback and are not inert, and each asks its own policy rather
than a shared one:
[DeleteAction](./actions/delete) ·
[RestoreAction](./actions/restore) ·
[ForceDeleteAction](./actions/force-delete) ·
[ReplicateAction](./actions/replicate) ·
[DetachAction](./actions/detach)

The route knows the difference between hiding a row, bringing it back and leaving nothing
to bring back, so a resource never declares it twice.

## Authorization

```ts
import type { Row } from "@perchjs/core";
import { Action, Notification, Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

class ArchiveAction extends Action {
  static make(): ArchiveAction {
    return new ArchiveAction({});
  }
  override get type(): string {
    return "ArchiveAction";
  }
  protected override with(state: ConstructorParameters<typeof Action>[0]): this {
    return new ArchiveAction(state) as this;
  }
}

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make()
      .columns([TextColumn.make("title")])
      .actions([
        ArchiveAction.make()
          .name("archive")
          .label("Archive")
          // Asked about this reader and this record.
          .authorize((user: unknown, record: Row) => record["authorId"] === (user as { id: number }).id)
          .action(() => Notification.make().title("Archived").success()),
      ]);
  }
}
```

**A hidden button was never the protection.** The guard is asked again when the action
runs, on every record in a selection, and a record it turns down is counted as refused
rather than skipped in silence.

That also means the reverse is true and worth knowing: an action can be drawn and still
refused. Nothing in the drawing is a permission.

## Asking first

```ts
import { Action, Notification } from "@perchjs/core";

class DestroyAction extends Action {
  static make(): DestroyAction {
    return new DestroyAction({});
  }
  override get type(): string {
    return "DestroyAction";
  }
  protected override with(state: ConstructorParameters<typeof Action>[0]): this {
    return new DestroyAction(state) as this;
  }
}

export const destroy = DestroyAction.make()
  .name("destroy")
  .label("Delete for good")
  .danger()
  .requiresConfirmation({
    heading: "Delete for good?",
    description: "This cannot be undone.",
    confirmLabel: "Delete",
  })
  .action(() => Notification.make().title("Deleted").danger());
```

`.danger()` says it is destructive, which changes how it is drawn.
`.requiresConfirmation()` makes the reader say so.

## Collecting something first

```ts
import type { Row } from "@perchjs/core";
import { Action, Notification, Schema, TextInput } from "@perchjs/core";

class ArchiveAction extends Action {
  static make(): ArchiveAction {
    return new ArchiveAction({});
  }
  override get type(): string {
    return "ArchiveAction";
  }
  protected override with(state: ConstructorParameters<typeof Action>[0]): this {
    return new ArchiveAction(state) as this;
  }
}

export const archive = ArchiveAction.make()
  .name("archive")
  .label("Archive")
  .form(Schema.make([TextInput.make("reason").required()]))
  .action((record: Row, data) => {
    void record;
    return Notification.make().title(`Archived: ${String(data["reason"])}`).success();
  });
```

A modal's form goes through the same boundary and the same validation as any other. It is
asked once and handed to every record in a selection, because a form that asked about one
record would have nothing to answer for over fifty of them.

A form that does not validate runs nothing and comes back with its errors on the fields
they belong to.

`.modalWidth()` and `.slideOver()` decide how it is presented. A slide-over is worth
having when the reader needs the page behind it while they fill it in.

## Telling the reader

A callback returns a `Notification`, or nothing.

```ts
import { Notification } from "@perchjs/core";

export const said = Notification.make()
  .title("Archived")
  .body("It is out of the list and still in the database.")
  .success();
```

`.success()`, `.warning()` and `.danger()` set the tone. Returning nothing says nothing,
which is right for an action whose effect is visible on the page it returns to.

## Grouping them

```ts
import { ActionGroup, EditAction, ViewAction } from "@perchjs/core";

export const more = ActionGroup.make([ViewAction.make(), EditAction.make()]);
```

A row with six buttons is a row nobody reads. A group draws one control that opens the
rest, and is labelled `More` unless told otherwise.

## What an action answers

Whatever it does, the answer says how many records it ran against and how many a guard
turned down. **Never why.** The panel does not say which record was refused or on what
grounds, because a message that named one would answer a question about it.
