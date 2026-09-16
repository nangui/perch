/**
 * Who was watching. One column for a person rather than three.
 */
import {
  AvatarColumn,
  DeleteAction,
  EditAction,
  Schema,
  Table,
  TextColumn,
  TextInput,
} from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Observer", navigationGroup: "Reference" })
export class ObserversResource implements PanelResource {
  form(): Schema {
    return Schema.make([
      TextInput.make("name").required(),
      TextInput.make("email").email().required(),
      TextInput.make("avatarUrl").label("Avatar").url(),
    ]);
  }

  table(): Table {
    return Table.make()
      .columns([
        AvatarColumn.make("name")
          .image("avatarUrl")
          .description("email")
          .searchable()
          .sortable(),
        TextColumn.make("joinedAt").label("Joined").sortable(),
      ])
      .actions([EditAction.make(), DeleteAction.make()])
      .defaultSort("name");
  }
}
