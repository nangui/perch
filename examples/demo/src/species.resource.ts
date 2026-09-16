/**
 * What was seen. The reference table the sightings point at.
 */
import {
  BadgeColumn,
  DeleteAction,
  EditAction,
  ImageColumn,
  Schema,
  Select,
  SelectFilter,
  Table,
  TextColumn,
  TextInput,
  ViewAction,
} from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

/** IUCN categories, shortened to the four a demo can usefully colour. */
const STATUS = {
  least: "Least concern",
  near: "Near threatened",
  vulnerable: "Vulnerable",
  endangered: "Endangered",
};

@PanelResource({ model: "Species", slug: "species", navigationGroup: "Reference" })
export class SpeciesResource implements PanelResource {
  form(): Schema {
    return Schema.make([
      TextInput.make("commonName").label("Common name").required(),
      TextInput.make("latinName").label("Latin name").required(),
      TextInput.make("family").required(),
      Select.make("status").options(STATUS).default("least").required(),
      TextInput.make("photoUrl").label("Photo").url(),
    ]);
  }

  table(): Table {
    return Table.make()
      .columns([
        ImageColumn.make("photoUrl").label("").size(40).circular(),
        TextColumn.make("commonName").label("Common name").searchable().sortable(),
        TextColumn.make("latinName").label("Latin name").searchable(),
        TextColumn.make("family").sortable(),
        BadgeColumn.make("status").color((value) =>
          value === "endangered"
            ? "danger"
            : value === "vulnerable"
              ? "warning"
              : value === "near"
                ? "neutral"
                : "success",
        ),
      ])
      .filters([SelectFilter.make("status").options(STATUS)])
      .actions([ViewAction.make(), EditAction.make(), DeleteAction.make()])
      .defaultSort("commonName");
  }
}
