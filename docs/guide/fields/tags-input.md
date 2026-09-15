---
title: TagsInput
---

# TagsInput

A list the reader writes rather than picks from.

```ts
import { Schema, TagsInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      TagsInput.make("keywords"),
    ]);
  }
}
```

It is the open counterpart of a [CheckboxList](/fields/checkbox-list). Both hold several
values, and only one of them has a set to be measured against. Here the reader invents the
members, so the field can say what a tag has to look like and cannot say which tags exist.

## Suggestions are not a list

```ts
import { Schema, TagsInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      TagsInput.make("keywords").suggestions(["news", "guides", "releases"]),
    ]);
  }
}
```

They are proposals. Offering them and refusing anything else would be a closed set with
extra steps, and the field for a closed set is already written: that is a
[Select](/fields/select) or a [CheckboxList](/fields/checkbox-list).

If you find yourself wanting to refuse what is not suggested, you wanted one of those.

## The separator

```ts
import { Schema, TagsInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      TagsInput.make("keywords").separator(","),
    ]);
  }
}
```

A separator lets one paste or keystroke become several tags. It also means a tag
containing it would come back as two, so such a tag is **refused** rather than quietly
split on the way home.

That is the trade, and it is the right way round: a value that changes shape between
being written and being read is worse than one the field would not accept.

## Empty is an answer

The value is a list. An empty one means the reader cleared it, which is a different fact
from never having been asked, and `.required()` means at least one.
