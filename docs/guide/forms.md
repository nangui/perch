---
title: Forms
---

# Forms

A form is a tree. `form()` returns one, the panel resolves it against the record and the
reader, and the browser draws whatever came back.

```ts
import { Schema, Select, TextInput, Textarea } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      TextInput.make("title").required().maxLength(120),
      Textarea.make("body").rows(8),
      Select.make("status").options({ draft: "Draft", live: "Live" }).default("draft"),
    ]);
  }
}
```

Every field names a column of the model, and every name is checked against the generated
schema at start-up: a mistyped one stops the boot rather than drawing a box that saves
nothing. Reaching through a relation is what a column or an entry does, because those
read. A form field writes, and a write goes to a column.

## What every field can do

These come from the base and work the same on all of them.

| | |
|---|---|
| `.label("Title")` | what the reader sees. The path itself when absent, which is rarely what you want on a screen |
| `.required()` | refused empty, and marked as such on the page |
| `.default("draft")` | used wherever the record has no value at that path, so on a create and on an empty column |
| `.placeholder("…")` | the grey text inside the box |
| `.helperText("…")` | a line under the control, sharing it with the error |
| `.hint("lowercase")` | a word beside the label, where an error cannot displace it |
| `.hintIcon("info")` | a mark before the hint. Decoration; the hint carries the meaning |
| `.disabled()` `.readOnly()` | drawn, and refused on the way back in |
| `.visible(…)` `.hidden(…)` | whether it is there at all |
| `.columnSpan(2)` | how much of the grid it takes |
| `.autofocus()` | where the cursor starts |
| `.live()` | send a round trip when it changes |
| `.rule(…)` `.rules([…])` | validation of your own |
| `.dehydrated(false)` | drawn, never saved |

## Conditions

Anything that takes a value takes a function instead, and the function runs on the
server.

```ts
import { Schema, Select, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      Select.make("kind").options({ post: "Post", page: "Page" }).live(),
      // Shown only for one of them. Nothing in the browser knows this rule.
      TextInput.make("slug").visible(({ get }) => get("kind") === "page"),
      // Read-only once it exists, because a published URL is a promise.
      TextInput.make("canonical").readOnly(({ operation }) => operation === "edit"),
    ]);
  }
}
```

A resolver is handed `get`, `set`, `operation`, `user` and, on an edit, `record`. It runs
where the rule was written, which is the whole reason a condition can depend on who is
asking without the browser being told what the rule is.

**An invisible field is not drawn, not validated and not saved.** It is absent from what
crosses, rather than present and marked. That is what makes `.visible()` a protection
rather than a decoration.

## Reactivity

`.live()` is the whole of it. A field that carries it sends a round trip when it changes,
the server resolves the tree against the new state, and what comes back replaces what was
drawn.

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
      // Its options are a function of another field, resolved on the server.
      Select.make("cityId")
        .options(({ get }): Record<string, string> => CITIES[String(get("countryId"))] ?? {})
        .visible(({ get }) => Boolean(get("countryId"))),
    ]);
  }
}
```

One round trip, and the budget for it is 150 ms at the 95th percentile, measured by a
test that blocks the build.

A field without `.live()` sends nothing while it is being typed into. That is the
default on purpose: a round trip per keystroke is a round trip per keystroke.

## Validation

`.required()` covers most of it, and a field's own type covers the rest: an email input
refuses what is not one, a number refuses what is not a number. Beyond that:

```ts
import { Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([
      TextInput.make("slug")
        .required()
        // `true` when it passes, and the message to show when it does not.
        .rule((value) =>
          /^[a-z0-9-]+$/.test(String(value)) ? true : "Lowercase and dashes only.",
        ),
      // The wording of the built-in refusals, in your own words.
      TextInput.make("email").email().required().validationMessages({
        required: "We need an address to write to.",
      }),
    ]);
  }
}
```

A rule answers `true` or the message to show. It runs on the server, with the rest of the
form in reach, so a rule about two fields at once is a rule like any other.

**Validation runs before the write, never after.** A form with errors touches nothing and
comes back with the errors on the fields they belong to.

## Laying it out

A form with twenty fields in one column is a form nobody reads. The layout components
nest, and they are components like any other: they take `.visible()`, they take
`.columnSpan()`.

```ts
import { Grid, Schema, Section, Select, TextInput, Textarea } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      Section.make("Content")
        .description("What the reader sees.")
        .schema([
          TextInput.make("title").required(),
          Textarea.make("body").rows(10),
        ]),

      Section.make("Publishing")
        .collapsed()
        .schema([
          Grid.make(2).schema([
            Select.make("status").options({ draft: "Draft", live: "Live" }),
            TextInput.make("publishedAt").label("Published"),
          ]),
        ]),
    ]);
  }
}
```

| | |
|---|---|
| `Section` | a titled block, optionally described and optionally collapsed |
| `Fieldset` | a group with a legend, for fields that belong together |
| `Grid` | columns, with `.columnSpan()` deciding what stretches |
| `Tabs` / `Tab` | one form, several pages, nothing fetched twice |
| `Callout` | a note to the reader, not an input |

## What is saved

By default, every field's value, under its own name. Two ways to change that:

```ts
import { Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([
      // Drawn, never written. A confirmation box, a preview, a total.
      TextInput.make("passwordAgain").password().dehydrated(false),
      // Written as something other than what was typed.
      TextInput.make("slug").dehydrateStateUsing((value) => String(value).toLowerCase()),
    ]);
  }
}
```

`dehydrated(false)` is not a way to hide a value from the reader. It is a way to keep one
out of the write. What a reader must not see is `.visible()`, and what a reader must not
change is `.disabled()`, and both of those are enforced again on the way back in.

## The fields

Each has a page of its own, with what it accepts and what it stores.

`TextInput` · `Textarea` · `Select` · `Checkbox` · `Toggle` · `Radio` · `CheckboxList` ·
`ToggleButtons` · `DateTimePicker` · `FileUpload` · `Repeater` · `TagsInput` ·
`KeyValue` · `ColorPicker` · `RichEditor` · `MarkdownEditor` · `Hidden` · `Placeholder`

Those pages are being written.
