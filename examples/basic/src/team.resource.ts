/**
 * The other table, and the reason a person's team can be created from a person.
 *
 * A select offering to create the option it is missing writes a row in the
 * model its relation points at, which makes it a create on that model. This is
 * where the permission to do that lives: without a resource standing for
 * `Team`, there is no `can()` to ask, and the boot refuses the offer rather
 * than letting a dialog write a row nothing authorised.
 */
import { Injectable } from "@nestjs/common";
import { PanelResource } from "@perchjs/nest";
import { Schema, Table, TextColumn, TextInput } from "@perchjs/core";

@Injectable()
@PanelResource({ model: "Team", slug: "teams", navigationGroup: "Directory" })
export class TeamResource {
  form(): Schema {
    return Schema.make([TextInput.make("name").label("Name").required().maxLength(60)]);
  }

  table(): Table {
    return Table.make().columns([TextColumn.make("name").label("Name").searchable()]);
  }
}
