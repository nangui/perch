---
title: AvatarColumn
---

# AvatarColumn

A face, a name, and the line under it, in one column.

```ts
import { AvatarColumn, Schema, Table, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "User" })
export class UsersResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("name")]);
  }

  table() {
    return Table.make().columns([
      AvatarColumn.make("name")
        .image("avatarUrl")
        .description("email")
        .sortable()
        .searchable(),
    ]);
  }
}
```

## Why it is one column and not three

Three columns is what a table of people looks like when nobody decided: a narrow one
holding a picture, one holding a first name, one holding an address, each with its own
heading and its own width. They are one thing, a person, and a reader scans them as one,
so they are drawn as one.

## It is sorted and searched by the name

The path you pass to `make()` is the name, and it is what sorting and searching act on.
That is the value the column is about; the face and the second line come along.

## The face is judged like any other address

At its own path, the way [`ImageColumn`](./image) judges one, and for the same reason: an
address bound for an attribute is the server's business wherever it was declared. A face
that comes from an upload needs `.disk()` here too, or the stored key is read as an
address, fails to be one, and no face is drawn.

## Shape and size

```ts
import { AvatarColumn, Table } from "@perchjs/core";

Table.make().columns([
  AvatarColumn.make("name").image("avatarUrl").square().size(40),
]);
```

Round by default, because the picture beside a name is a face, and a face in a square is
a passport photograph. `square()` is there when the picture is a logo rather than a
person.
