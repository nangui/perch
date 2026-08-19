import { Injectable } from "@nestjs/common";
import type {
  EntryTone,
  Option,
  Schema as SchemaTree,
  Table as TableTree,
} from "@perchjs/core";
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
  Repeater,
  RepeatableEntry,
  Schema,
  Section,
  Select,
  SelectFilter,
  Table,
  Textarea,
  TextColumn,
  TextFilter,
  TextEntry,
  TextInput,
  Toggle,
  ViewAction,
} from "@perchjs/core";
import { Action, Notification } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

/** An action a host writes, which is the only kind that carries a callback. */
class ArchiveAction extends Action {
  static make(): ArchiveAction {
    return new ArchiveAction({});
  }

  override get type(): string {
    return "ArchiveAction";
  }

  protected override with(state: ConstructorParameters<typeof Action>[0]): this {
    return new ArchiveAction(state) as this;
  }
}

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

/** What each role is worth saying about it, for the badge on the View page. */
const ROLE_TONES: Readonly<Record<string, EntryTone>> = {
  lead: "success",
  member: "neutral",
  guest: "warning",
};

@PanelResource({ model: "Person", slug: "people", navigationGroup: "Directory" })
export class PersonResource {
  readonly #cities: Cities;

  constructor(cities: Cities) {
    this.#cities = cities;
  }

  /** What the list page shows, and what it lets you do from there. */
  table(): TableTree {
    // One instance, offered in two places: the row and the ticked selection put
    // the identical declaration through, which is the whole point of there
    // being no separate bulk class.
    const remove = DeleteAction.make().requiresConfirmation({
      heading: "Delete the selected people?",
      description: "This cannot be undone.",
      confirmLabel: "Delete",
    });

    // An action that asks for something before it runs. The modal is a schema
    // like any other, so the dependent field below is reactive inside it.
    const archive = ArchiveAction.make()
      .label("Archive")
      .requiresConfirmation({ heading: "Archive them", confirmLabel: "Archive" })
      .form(
        Schema.make([
          Select.make("reason")
            .label("Reason")
            .options({ left: "Left the company", inactive: "No longer active" })
            .required()
            .live(),
          Textarea.make("note")
            .label("Note")
            .rows(3)
            .placeholder("Anything worth recording.")
            .visible(({ get }) => get("reason") === "left"),
        ]),
      )
      .action((record) => {
        return Notification.make()
          .title(`Archived ${String(record["firstName"])}`)
          .success();
      });

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
      .actions([ViewAction.make(), EditAction.make(), archive, remove])
      .bulkActions([archive, remove])
      .headerActions([CreateAction.make()])
      .defaultSort("firstName");
  }

  /**
   * The View page, at `{path}/people/:id`.
   *
   * Entries, not fields: nothing here is typed into and nothing is saved. The
   * relation is named as a path, so the row and the team come back in one
   * query rather than one each.
   *
   * `country`, `city` and `role` are stored as codes and are shown as codes.
   * Formatting shapes a value and a badge colours one; neither looks one up.
   * What turns `fr` into `France` is the same list the form's `Select` already
   * holds, and reaching it from here is a decision nobody has taken.
   */
  infolist(): SchemaTree {
    return Schema.make([
      Section.make("Identity")
        .columns(2)
        .schema([
          TextEntry.make("firstName").label("First name"),
          TextEntry.make("lastName").label("Last name"),
          // What a reader most often does with an address on a detail page is
          // write to it or paste it somewhere.
          TextEntry.make("email")
            .label("Email")
            .url((value) => `mailto:${String(value)}`)
            .copyable(),
          TextEntry.make("team.name").label("Team").placeholder("Unassigned"),
        ]),

      Section.make("About").schema([
        TextEntry.make("bio")
          .label("Biography")
          .limit(60)
          .placeholder("Nothing written about them yet."),
        // A value from a closed set, so the shape says so before the word is
        // read. It is still the stored code: a badge colours a value, it does
        // not look one up.
        TextEntry.make("role")
          .label("Role")
          .badge()
          .color((value) => ROLE_TONES[String(value)])
          .placeholder("None"),
      ]),

      // The relation, read. One `include` with the row, one group per note, and
      // each note's entry reading that note.
      Section.make("Notes").schema([
        RepeatableEntry.make("notes").schema([TextEntry.make("body").label("Note")]),
      ]),

      Section.make("Status")
        .columns(2)
        .schema([
          TextEntry.make("city").label("City").placeholder("Not given"),
          // Stored as an instant, read on a Paris wall clock — the same zone
          // the form edits it in — and turned into words by the reader's own
          // browser, which is the only thing that knows their locale.
          TextEntry.make("startsAt")
            .label("Starts at")
            .dateTime({ timezone: "Europe/Paris" })
            .placeholder("Not scheduled"),
        ]),
    ]);
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

      Section.make("About")
        .collapsible()
        .schema([
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

      // The repeater, and milestone A3: adding, editing, reordering and
      // deleting rows in one transaction. Its value is the ordered list of row
      // keys; the fields below are what one row holds.
      //
      // Not inside a `Section`: it draws its own head, with its own name and
      // count, so a section around it is a card in a card saying "Notes" twice.
      Repeater.make("noteRows")
        .label("Notes")
        .relationship("notes")
        .maxItems(5)
        .collapsible()
        // Named by what is in it, so a row is more than its position — which
        // changes the moment anything is reordered.
        .itemLabel(({ get }) => {
          const body = get("body");
          return typeof body === "string" && body !== ""
            ? body.slice(0, 40)
            : "New note";
        })
        .schema([TextInput.make("body").label("Note").required()]),

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
