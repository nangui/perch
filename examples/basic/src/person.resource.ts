import { Injectable } from "@nestjs/common";
import type { Option, Schema as SchemaTree, Table as TableTree } from "@perchjs/core";
import {
  Checkbox,
  CreateAction,
  DateTimePicker,
  DeleteAction,
  EditAction,
  FileUpload,
  Hidden,
  Placeholder,
  Radio,
  Schema,
  Section,
  Select,
  SelectFilter,
  Table,
  Textarea,
  TextColumn,
  TextFilter,
  TextInput,
  Toggle,
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

/** A resolver reads `unknown`: what a row holds is the database's business. */
function name(value: unknown): string {
  return typeof value === "string" && value !== "" ? value : "Somebody";
}

const COUNTRIES = { fr: "France", be: "Belgium", ci: "Côte d'Ivoire" };
const ROLES = { lead: "Lead", member: "Member", guest: "Guest" };

@PanelResource({ model: "Person", slug: "people", navigationGroup: "Directory" })
export class PersonResource {
  readonly #cities: Cities;

  constructor(cities: Cities) {
    this.#cities = cities;
  }

  /** What the list page shows, and what it lets you do from there. */
  table(): TableTree {
    return Table.make()
      .columns([
        TextColumn.make("firstName").label("First name").sortable().searchable(),
        TextColumn.make("lastName").label("Last name").searchable(),
        TextColumn.make("city").label("City"),
        // Reads through the relation. One `include` for the page, never one
        // query per row.
        TextColumn.make("team.name").label("Team"),
      ])
      .filters([
        SelectFilter.make("country").label("Country").options(COUNTRIES),
        SelectFilter.make("role").label("Role").options(ROLES),
        TextFilter.make("email").label("Email contains"),
      ])
      .actions([
        EditAction.make(),
        // Confirms by default and cannot be talked out of it: v0.1 has no
        // restore, so a misclick here is final.
        DeleteAction.make().requiresConfirmation({
          heading: "Delete this person?",
          description: "This cannot be undone.",
          confirmLabel: "Delete",
        }),
      ])
      .headerActions([CreateAction.make()])
      .defaultSort("firstName");
  }

  form(): SchemaTree {
    return Schema.make([
      Section.make("Identity")
        .columns(2)
        .schema([
          TextInput.make("firstName").label("First name").placeholder("Ada").required(),
          TextInput.make("lastName")
            .label("Last name")
            .placeholder("Lovelace")
            .required(),
          TextInput.make("email")
            .email()
            .placeholder("ada@example.com")
            .required()
            .maxLength(255),
          // Never shown, never settable from the browser, and written all the
          // same: the value comes from the row or from this default.
          Hidden.make("tenantId").default(1),
        ]),

      Section.make("Where they live")
        .columns(2)
        .schema([
          Select.make("country")
            .label("Country")
            .options(COUNTRIES)
            .placeholder("Pick a country")
            // Without this the field is submitted with the form and nothing is
            // asked of the server while typing.
            .live(),
          Select.make("city")
            .label("City")
            .options(({ get }) => this.#cities.inCountry(String(get("country"))))
            .placeholder("Pick a city")
            .visible(({ get }) => Boolean(get("country")))
            .helperText("Follows the country."),
        ]),

      Section.make("About").schema([
        Textarea.make("bio")
          .label("Biography")
          .rows(4)
          .autosize()
          .maxLength(280)
          .placeholder("A line or two about them.")
          .helperText("Counted in characters, and refused on the server too."),
        Radio.make("role").label("Role").options(ROLES).inline(),
      ]),

      Section.make("Status")
        .columns(2)
        .schema([
          Toggle.make("active").label("Active").onColor("success"),
          Checkbox.make("onCall").label("On call this week").inlineLabel(),
          DateTimePicker.make("startsAt")
            .label("Starts at")
            .timezone("Europe/Paris")
            .helperText("Stored in UTC, shown in Paris time."),
          // Computed on the server on every pass, saved nowhere.
          Placeholder.make("summary")
            .label("Summary")
            .content(
              ({ get }) =>
                `${name(get("firstName"))} — ${
                  get("active") === true ? "active" : "inactive"
                }`,
            ),
        ]),

      Section.make("Photo").schema([
        FileUpload.make("avatar")
          .label("Avatar")
          .image()
          .maxSize(2 * 1024 * 1024)
          .directory("avatars")
          .helperText("Goes up when you choose it; kept when you save."),
      ]),
    ]);
  }
}
