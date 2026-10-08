/**
 * The smallest table here, and the one every other row points at.
 */
import {
  DeleteAction,
  EditAction,
  Schema,
  Table,
  TextColumn,
  TextInput,
} from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Department", navigationGroup: "Organisation" })
export class DepartmentsResource implements PanelResource {
  form(): Schema {
    return Schema.make([
      TextInput.make("name").required(),
      TextInput.make("code").label("Short code").required().maxLength(8),
    ]);
  }

  table(): Table {
    return Table.make()
      .columns([
        TextColumn.make("name").searchable().sortable(),
        TextColumn.make("code").label("Short code").width("8rem"),
      ])
      .actions([EditAction.make(), DeleteAction.make()])
      .defaultSort("name");
  }
}
