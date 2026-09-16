/**
 * The record itself, and the one table worth the visit.
 *
 * Three relations to follow, a date to filter on, a state to colour and a flag
 * a reader can turn from the list. It soft-deletes, so deleting one here is
 * something the demo can survive and a visitor can undo.
 */
import {
  BadgeColumn,
  DateRangeFilter,
  DateTimePicker,
  DeleteAction,
  EditAction,
  ForceDeleteAction,
  RestoreAction,
  Schema,
  Select,
  SelectFilter,
  Table,
  Textarea,
  TextEntry,
  TextColumn,
  TextInput,
  Toggle,
  ToggleColumn,
  IconEntry,
  TrashedFilter,
  ViewAction,
} from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

const CERTAINTY = {
  certain: "Certain",
  probable: "Probable",
  possible: "Possible",
};

@PanelResource({ model: "Sighting", navigationGroup: "Records" })
export class SightingsResource implements PanelResource {
  form(): Schema {
    return Schema.make([
      Select.make("speciesId")
        .label("Species")
        .relationship("species", "commonName")
        .required(),
      Select.make("observerId").label("Observer").relationship("observer").required(),
      Select.make("siteId").label("Site").relationship("site").required(),
      DateTimePicker.make("seenAt").label("Seen at").required(),
      TextInput.make("count").numeric(1).default(1).required(),
      Select.make("certainty").options(CERTAINTY).default("certain").required(),
      Toggle.make("confirmed"),
      Textarea.make("notes"),
    ]);
  }

  /**
   * What the dialog shows, and what the View page would.
   *
   * Declared once: the modal and the page read the same thing, resolved the
   * same way against the same policy.
   */
  infolist(): Schema {
    return Schema.make([
      TextEntry.make("species.commonName").label("Species"),
      TextEntry.make("species.latinName").label("Latin name"),
      TextEntry.make("site.name").label("Site"),
      TextEntry.make("observer.name").label("Observer"),
      TextEntry.make("seenAt").label("Seen at").dateTime(),
      TextEntry.make("count").label("How many"),
      TextEntry.make("certainty"),
      IconEntry.make("confirmed").boolean(),
      TextEntry.make("notes"),
    ]);
  }

  table(): Table {
    return Table.make()
      .columns([
        TextColumn.make("species.commonName").label("Species").searchable().sortable(),
        TextColumn.make("site.name").label("Site").searchable(),
        TextColumn.make("observer.name").label("Observer"),
        TextColumn.make("seenAt").label("Seen").sortable(),
        TextColumn.make("count").sortable(),
        BadgeColumn.make("certainty").color((value) =>
          value === "certain"
            ? "success"
            : value === "probable"
              ? "neutral"
              : "warning",
        ),
        ToggleColumn.make("confirmed"),
      ])
      .filters([
        SelectFilter.make("certainty").options(CERTAINTY),
        DateRangeFilter.make("seenAt").label("Seen between"),
        TrashedFilter.make(),
      ])
      .actions([
        ViewAction.make().inModal(),
        EditAction.make(),
        DeleteAction.make(),
        RestoreAction.make(),
        ForceDeleteAction.make(),
      ])
      .defaultSort("seenAt");
  }
}
