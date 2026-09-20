/**
 * What was seen. The reference table the sightings point at.
 */
import {
  BadgeColumn,
  DeleteAction,
  EditAction,
  ImageColumn,
  ImageEntry,
  Schema,
  Select,
  SelectFilter,
  Table,
  TextColumn,
  TextEntry,
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

/**
 * How worried to look about a category, in the table and on the page alike.
 *
 * One function rather than two copies: the badge in the list and the badge on
 * the record are the same judgement about the same value, and two of them go
 * out of step the first time one is edited.
 */
const worry = (value: unknown): "danger" | "warning" | "neutral" | "success" =>
  value === "endangered"
    ? "danger"
    : value === "vulnerable"
      ? "warning"
      : value === "near"
        ? "neutral"
        : "success";

@PanelResource({
  model: "Species",
  slug: "species",
  // Its own plural, which no rule works out: the default turns the label into
  // "Specieses" and puts that in the navigation and every breadcrumb.
  pluralLabel: "Species",
  navigationGroup: "Reference",
})
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

  /**
   * How one species reads, on a page of its own.
   *
   * Declared because the list offers a View that is a link rather than a
   * dialog, and a link needs somewhere to land: without this the button is
   * drawn, pressed, and answers 404. The page and a modal would read the same
   * thing — a resource says how a record reads once.
   */
  infolist(): Schema {
    return Schema.make([
      ImageEntry.make("photoUrl").label("Photo").size(96).circular(),
      TextEntry.make("commonName").label("Common name"),
      TextEntry.make("latinName").label("Latin name"),
      TextEntry.make("family").label("Family"),
      TextEntry.make("status").label("Status").badge().color(worry),
    ]);
  }

  table(): Table {
    return Table.make()
      .columns([
        ImageColumn.make("photoUrl").label("").size(40).circular(),
        TextColumn.make("commonName").label("Common name").searchable().sortable(),
        TextColumn.make("latinName").label("Latin name").searchable(),
        TextColumn.make("family").sortable(),
        BadgeColumn.make("status").color(worry),
      ])
      .filters([SelectFilter.make("status").options(STATUS)])
      .actions([ViewAction.make(), EditAction.make(), DeleteAction.make()])
      .defaultSort("commonName");
  }
}
