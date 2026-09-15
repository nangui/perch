---
title: MarkdownEditor
---

# MarkdownEditor

Text that is already what it means.

```ts
import { MarkdownEditor, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      MarkdownEditor.make("body").rows(12).maxLength(20_000),
    ]);
  }
}
```

## The opposite decision, for the opposite reason

A [RichEditor](/fields/rich-editor) keeps a document because HTML arriving from a browser
would have to be sanitised on the server, and that is not code this framework is willing
to carry.

Markdown needs none of it. It is text in the column, text on the wire and text in the
box. What it means is decided when it is drawn, and drawing is the browser's half of the
job.

So there is nothing here to convert and nothing to walk. What the field says is how tall
the box starts, how much it holds, and which buttons the page offers.

## The toolbar is also the preview

```ts
import { MarkdownEditor, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      MarkdownEditor.make("notes").toolbar(["bold", "italic", "link"]),
    ]);
  }
}
```

The tools are `bold`, `italic`, `strike`, `code`, `h2`, `h3`, `bulletList`,
`orderedList`, `blockquote`, `codeBlock` and `link`.

That list is deliberately short. Markdown has a long tail, tables and footnotes and
references, and a preview that draws a subset while the toolbar offers the whole is a
promise kept in one place and broken in the other. The buttons and the preview are the
same list, so what a reader can write is what a reader can see.

## Which editor

| | RichEditor | MarkdownEditor |
|---|---|---|
| The column holds | a document tree | text |
| Refused by | the toolbar, node by node | length, like any text |
| Suits | somebody who should not think about syntax | somebody who already writes markdown |
| Rendered by | the panel, from the tree | whatever draws your markdown |

If the text is going anywhere but this panel, a static site or an API or an email,
markdown travels and a document tree does not. If it is only ever read here and the
people writing it are not writers of syntax, the rich editor asks less of them.

Choose once. Moving later means migrating what is already in the column.
