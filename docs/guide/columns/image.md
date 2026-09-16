---
title: ImageColumn
---

# ImageColumn

One address, or several, drawn rather than read.

```ts
import { ImageColumn, Schema, Table, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make().columns([
      ImageColumn.make("cover").label("Cover").size(48),
    ]);
  }
}
```

## The address is judged on the server

What this column holds is a URL, and a URL out of a row is a URL from anywhere: it gets
the same reading an image in a schema gets. One that does not pass is **dropped rather
than sent and hidden**. What the browser never receives cannot end up in an attribute by
mistake.

That judgement happens here and not in the renderer, both because that is where the rule
lives and because the alternative is the same check written a second time in a package
that may not import this one.

## A column over a file upload needs its disk

```ts
import { ImageColumn, Table } from "@perchjs/core";

Table.make().columns([ImageColumn.make("cover").disk("public").size(48)]);
```

A file upload stores a key, and a key is not an address: it becomes one through the disk
that keeps it, which is your application's to answer for.

Without `.disk()` the stored value is read as an address on its own. An `https://` URL
passes, and so does a path rooted at `/`. A bare upload key like `uploads/a.png` is
neither, so it is dropped and the cell draws nothing.

If a column of images is mysteriously empty, this is almost always why.

A `javascript:` value is dropped whichever way the column is declared.

## Several in one cell

```ts
import { ImageColumn, Table } from "@perchjs/core";

Table.make().columns([
  ImageColumn.make("gallery").stacked().circular().size(32).limit(3),
]);
```

`stacked()` overlaps them, which is how a row shows a group without taking a row's width
to do it. `limit()` caps how many are drawn; the rest are counted rather than shown.
`circular()` is a circle instead of a square.
