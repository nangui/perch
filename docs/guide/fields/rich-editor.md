---
title: RichEditor
---

# RichEditor

Formatted prose, stored as a document rather than as a string of HTML.

```ts
import { RichEditor, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      RichEditor.make("body").toolbar(["bold", "italic", "link", "bulletList"]),
    ]);
  }
}
```

## Why not HTML

HTML is the obvious choice and the wrong one.

Accepting HTML from a browser means sanitising HTML on the server, and the package the
trust boundary lives in is the one that must import nothing at all. A hand-written HTML
sanitiser in that file is the last thing this framework should contain.

So the column keeps the editor's own document: a tree of nodes and marks. A tree needs no
parser, which means there is nothing to get subtly wrong between what one library
considers safe and what the next one does.

## The toolbar is the boundary

This is the part worth understanding, because it is what makes a document from a client
safe to keep.

Every node type and every mark in an arriving document is measured against the toolbar
the field declared. What no button can produce is refused. It is the same pattern a
select uses for its options, one level deeper: the declaration is the oracle, and
anything outside it does not get in.

**A form that offers no italic is a form whose stored documents have no italic in them,
however the state arrives.** Not because the button is missing from the page, but because
the mark is not admitted.

```ts
import { RichEditor, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      // Comments get emphasis and links, and nothing structural.
      RichEditor.make("comment").toolbar(["bold", "italic", "link"]),
    ]);
  }
}
```

The tools are `bold`, `italic`, `underline`, `strike`, `code`, `h2`, `h3`, `bulletList`,
`orderedList`, `blockquote`, `codeBlock`, `link` and `rule`.

Narrowing the toolbar is therefore a real narrowing of what the column can hold, and it
is worth doing deliberately rather than offering everything because the buttons exist.

## Links

A `link` mark carries an address, and an address from a client is checked like every
other address in the panel. `javascript:` in an `href` is how somebody else's script
comes to run on your page, and the browser is not the place to find that out.

## Depth

A forged document can nest as deep as its author cares to type, and a walk that follows
it without a limit is a stack overflow somebody else chose the moment for. The bound is
twenty, which nothing anybody writes comes near: a blockquote inside a list inside a
blockquote is four. Past it the document is refused whole, rather than truncated into
something nobody wrote.
