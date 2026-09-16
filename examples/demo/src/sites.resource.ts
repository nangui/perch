/**
 * Where. Small on purpose: the demo needs one table that is simply a table.
 */
import {
  DeleteAction,
  EditAction,
  Schema,
  Select,
  SelectFilter,
  Table,
  TextColumn,
  TextInput,
} from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

const HABITAT = {
  wetland: "Wetland",
  woodland: "Woodland",
  coast: "Coast",
  moorland: "Moorland",
  urban: "Urban",
};

@PanelResource({ model: "Site", navigationGroup: "Reference" })
export class SitesResource implements PanelResource {
  form(): Schema {
    return Schema.make([
      TextInput.make("name").required(),
      TextInput.make("region").required(),
      Select.make("habitat").options(HABITAT).default("wetland").required(),
    ]);
  }

  table(): Table {
    return Table.make()
      .columns([
        TextColumn.make("name").searchable().sortable(),
        TextColumn.make("region").searchable().sortable(),
        TextColumn.make("habitat"),
      ])
      .filters([SelectFilter.make("habitat").options(HABITAT)])
      .actions([EditAction.make(), DeleteAction.make()])
      .defaultSort("name");
  }
}
