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
import { isWarden } from "./who.js";

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
        AvatarColumn.make("name").image("avatarUrl").searchable().sortable(),
        TextColumn.make("joinedAt").label("Joined").dateTime().sortable(),
        // Only for a reader the demo calls a warden. Nobody is signed in here,
        // so `?as=warden` is what stands in for one: the panel does what the
        // resolver says, and this one reads the address.
        //
        // The avatar above deliberately does not take `email` as its second
        // line, though it would read well there. A column hides a column and
        // not a path: another column reading the same one would have the value
        // travelling anyway, and correctly, because that column needs it.
        TextColumn.make("email").label("Address").visible(isWarden),
      ])
      .actions([EditAction.make(), DeleteAction.make()])
      .defaultSort("name");
  }
}
