---
title: Textarea
---

# Textarea

Several lines of text.

```ts
import { Schema, Textarea } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      Textarea.make("summary").rows(4).maxLength(500),
    ]);
  }
}
```

## How tall

`.rows()` is the height it starts at. `.autosize()` lets it grow with what is typed,
which is worth having whenever the length is genuinely unknown and worth avoiding when
the form's shape matters more than the text.

```ts
import { Schema, Textarea } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      Textarea.make("notes").rows(3).autosize(),
    ]);
  }
}
```

## Length

`.minLength()` and `.maxLength()` behave as they do on a text input: drawn on the
control, and checked again on the server.

## When not to use it

A textarea holds text. If what it holds is going to be rendered as something else later,
say so now:

- Markdown that a reader is meant to write deliberately: `MarkdownEditor`.
- Formatted prose with headings and links: `RichEditor`.

Both store something a textarea cannot round-trip faithfully, and moving later means
migrating what is already in the column.
