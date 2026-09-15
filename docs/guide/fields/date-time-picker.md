---
title: DateTimePicker
---

# DateTimePicker

A wall clock in the form, an instant in the column.

```ts
import { DateTimePicker, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Event" })
export class EventsResource implements PanelResource {
  form() {
    return Schema.make([
      DateTimePicker.make("startsAt").timezone("Europe/Paris"),
    ]);
  }
}
```

## The zone is declared, never inferred

This is the whole design, and it is worth a paragraph before anything else.

A panel is read by people in several places and written to one database. "The browser's
zone" would mean a row showing a different hour to each of them. "The server's zone"
would mean a deployment moving every date in the table. So the zone is named, in IANA
form, and it is the one the business keeps its hours in.

The default is `UTC`. That is a safe answer and rarely the right one: if your opening
hours are in Paris, say `Europe/Paris`, or every date a reader types will be three hours
away from the one they meant.

What crosses the wire is `2026-03-29T02:30`, with no `Z` and no offset, because that is
what a reader sees on their own wall. The conversion happens on the server, once on the
way in and once on the way out.

## A day with no time

```ts
import { DateTimePicker, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([
      DateTimePicker.make("bornOn").date().timezone("Europe/Paris"),
    ]);
  }
}
```

`.date()` drops the time of day. The instant stored is midnight in the field's zone,
which is what makes a birthday land on the right day for everybody reading it.

## Bounds

```ts
import { DateTimePicker, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Event" })
export class EventsResource implements PanelResource {
  form() {
    return Schema.make([
      DateTimePicker.make("startsAt")
        .timezone("Europe/Paris")
        .minDate("2026-01-01T00:00")
        .maxDate("2026-12-31T23:59"),
    ]);
  }
}
```

Both are wall-clock strings in the field's own zone, in the same shape the control sends.

## There is no `.format()`

There will not be one either. The control shows ISO segments on purpose: a free-text date
parsed by locale is how `03/04` comes to mean two different days on two desks, and an
option to format it is an invitation to reintroduce exactly that.

## The two hours a year

Twice a year a wall clock says something that is not a single instant. On a spring
forward `02:30` never happens; on an autumn back it happens twice. Both are decided here
rather than left to whatever falls out, and neither throws:

- **A time that happened twice takes the first of the two.** The reader wrote a time that
  had already come once, and taking the later one moves their appointment an hour into
  the future.
- **A time that never happened takes the instant it would have had.** The clock skipped
  from `02:00` to `03:00`, so `02:30` becomes `03:30`, rather than an error about a time
  somebody's own calendar showed them.

You will not meet this often. It is written down because when you do, the alternative is
wondering whether the framework or the database moved your hour.
