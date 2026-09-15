---
title: Select
---

# Select

A choice from a list. The list is the server's to decide, always.

```ts
import { Schema, Select } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      Select.make("status").options({ draft: "Draft", live: "Live" }).default("draft"),
    ]);
  }
}
```

Options take an object keyed by the stored value, or a list of `{ value, label }` when
the order matters more than the shape.

## Options that depend on something

```ts
import { Schema, Select } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

const CITIES: Record<string, Record<string, string>> = {
  fr: { paris: "Paris", lyon: "Lyon" },
  be: { brussels: "Brussels" },
};

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([
      Select.make("countryId").options({ fr: "France", be: "Belgium" }).live(),
      Select.make("cityId").options(
        ({ get }): Record<string, string> => CITIES[String(get("countryId"))] ?? {},
      ),
    ]);
  }
}
```

The `.live()` on the field being watched is what makes this work: it is what sends the
round trip. The dependent field needs nothing, because it is resolved server-side like
everything else.

Options can also depend on who is asking. `user` is in the same context, and a list that
leaves out what this reader may not pick is a list they cannot pick it from, which is a
different thing from a disabled option they can see.

## From a relation

```ts
import { Schema, Select } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      // Loads the labels, searches them, stores the foreign key.
      Select.make("author").relationship("author", "name").searchable(),
    ]);
  }
}
```

The second argument is the column to read the label from, and it defaults to `name`.

## Searching

```ts
import { Schema, Select } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      Select.make("author").relationship("author").searchable().optionsLimit(20),
    ]);
  }
}
```

**Searching happens on the server.** Ten thousand options filtered in a browser is ten
thousand options sent to a browser, which is slow, and it is also a list of every row's
label handed to somebody who may only be allowed to pick from a few.

`.optionsLimit()` caps what one answer carries. `.preload()` fetches the list once, up
front, which is right for a short fixed list and wrong for anything that grows.

## Several at once

```ts
import { Schema, Select } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      Select.make("tags").options({ news: "News", guide: "Guide" }).multiple(),
    ]);
  }
}
```

`.multiple()` and `.relationship()` together are refused, in either order, with a message
saying that writing several rows of a relation is not supported yet. It is a limit rather
than a position: until it moves, a to-many relationship is written with a repeater or
with a relation manager, both of which handle the rows.

## Making the missing one

A reader filling in a person and finding their team missing has two bad options: abandon
what they have typed, or save something wrong and fix it later.

```ts
import { Schema, Select, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([
      Select.make("team")
        .relationship("team")
        .createOptionForm(Schema.make([TextInput.make("name").required()])),
    ]);
  }
}
```

The dialog's form goes through the same boundary and the same validation as any other.
What it writes lands in a table the browser has only a window onto, so what the field now
holds and what its list now shows are both answered by the server rather than guessed at
by the page.
