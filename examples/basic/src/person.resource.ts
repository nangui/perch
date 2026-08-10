import { Injectable } from "@nestjs/common";
import type { Option } from "@perchjs/core";
import {
  CreateAction,
  EditAction,
  Schema,
  Section,
  Select,
  Table,
  TextColumn,
  TextInput,
} from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

/**
 * An ordinary Nest provider. The point of injecting it is that the options below
 * are computed by application code, on the server, during the request — not by
 * anything the panel knows about.
 */
@Injectable()
export class Cities {
  readonly #byCountry: Record<string, Option[]> = {
    fr: [
      { value: "paris", label: "Paris" },
      { value: "lyon", label: "Lyon" },
      { value: "marseille", label: "Marseille" },
    ],
    be: [
      { value: "brussels", label: "Brussels" },
      { value: "ghent", label: "Ghent" },
    ],
    ci: [
      { value: "abidjan", label: "Abidjan" },
      { value: "bouake", label: "Bouaké" },
    ],
  };

  inCountry(country: string): Option[] {
    return this.#byCountry[country] ?? [];
  }
}

@PanelResource({ model: "Person", slug: "people", navigationGroup: "Directory" })
export class PersonResource {
  readonly #cities: Cities;

  constructor(cities: Cities) {
    this.#cities = cities;
  }

  /** What the list page shows, and what it lets you do from there. */
  table(): Table {
    return Table.make()
      .columns([
        TextColumn.make("firstName").label("First name").sortable(),
        TextColumn.make("lastName").label("Last name"),
        TextColumn.make("city").label("City"),
      ])
      .actions([EditAction.make()])
      .headerActions([CreateAction.make()])
      .defaultSort("firstName");
  }

  form(): Schema {
    return Schema.make([
      Section.make("Identity")
        .columns(2)
        .schema([
          TextInput.make("firstName").label("First name").required(),
          TextInput.make("lastName").label("Last name").required(),
          TextInput.make("email").email().required().maxLength(255),
        ]),
      Section.make("Where they live")
        .columns(2)
        .schema([
          Select.make("country")
            .label("Country")
            .options({ fr: "France", be: "Belgium", ci: "Côte d'Ivoire" })
            // Without this the field is submitted with the form and nothing is
            // asked of the server while typing.
            .live(),
          Select.make("city")
            .label("City")
            .options(({ get }) => this.#cities.inCountry(String(get("country"))))
            .visible(({ get }) => Boolean(get("country")))
            .helperText("Follows the country."),
        ]),
    ]);
  }
}
