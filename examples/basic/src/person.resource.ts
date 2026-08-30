import { Injectable } from "@nestjs/common";
import type {
  EntryTone,
  Option,
  Schema as SchemaTree,
  Table as TableTree,
} from "@perchjs/core";
import {
  ActionGroup,
  Callout,
  Checkbox,
  CheckboxColumn,
  CheckboxList,
  ColorColumn,
  ColorPicker,
  CreateAction,
  DateRangeFilter,
  DateTimePicker,
  DeleteAction,
  EditAction,
  Fieldset,
  FileUpload,
  ForceDeleteAction,
  Grid,
  Hidden,
  Icon,
  IconColumn,
  Image,
  ImageColumn,
  KeyValue,
  MarkdownEditor,
  NumberRangeFilter,
  Placeholder,
  Radio,
  RepeatableEntry,
  Repeater,
  ReplicateAction,
  RestoreAction,
  RichEditor,
  Schema,
  SchemaFilter,
  Section,
  SelectColumn,
  Select,
  SelectFilter,
  Tab,
  Table,
  Tabs,
  TagsInput,
  TernaryFilter,
  Text,
  Textarea,
  TextColumn,
  TextEntry,
  TextFilter,
  TextInput,
  TextInputColumn,
  Toggle,
  ToggleButtons,
  ToggleColumn,
  TrashedFilter,
  ViewAction,
} from "@perchjs/core";
import { Action, Notification } from "@perchjs/core";
import { PanelResource, RelationManager } from "@perchjs/nest";
import { Stars } from "./stars.js";

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
/** A handful, which is the length this field is for. */
const SKILLS = {
  compilers: "Compilers",
  cryptography: "Cryptography",
  hardware: "Hardware",
  teaching: "Teaching",
};

const ROLES = { lead: "Lead", member: "Member", guest: "Guest" };

/** The other closed set on the page, drawn as a segmented control. */
const ACCESS = { read: "Read", write: "Write", admin: "Admin" };

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
      // Against the side, because the form under it grows a second field when
      // the reason is answered, and a centred box that changes height under a
      // reader is a box that moves what they were about to press. Same dialog
      // either way: the focus trap, the Escape key and the inert background
      // come from `showModal()` and not from where the panel sits.
      .slideOver()
      .modalWidth("lg")
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

    // One instance in both lists, not two: two actions of one name is a form the
    // boot refuses, and rightly — a request names an action by its name, so the
    // second could never be reached.
    const restore = RestoreAction.make();
    const destroy = ForceDeleteAction.make();

    return (
      Table.make()
        .columns([
          // The address is judged on the server: what a browser may fetch is
          // sent and what it may not is dropped, so nothing reaches an `src`
          // unread.
          ImageColumn.make("avatar").label("").disk("default").circular().size(28),
          TextColumn.make("firstName").label("First name").sortable().searchable(),
          // A line of text, edited where it is read — and still written through
          // the form, so `required` on the field holds here too.
          TextInputColumn.make("lastName").label("Last name").searchable(),
          TextColumn.make("city").label("City"),
          // Reads through the relation. One `include` for the page, never one
          // query per row.
          TextColumn.make("team.name").label("Team"),
          // Whatever notation the column keeps — this one keeps `hsl()`.
          ColorColumn.make("tint").label("Tint").copyable(),
          // The choices are the form field's own, over the wire: one list, in
          // one place, and the boundary matches against it.
          SelectColumn.make("role").label("Role"),
          // Written from the table, through the form that owns the field: the
          // same policy, the same boundary, the same rules.
          ToggleColumn.make("active").label("Active"),
          CheckboxColumn.make("onCall").label("On call"),
        ])
        .filters([
          // Three states, one of which is the ordinary page. It lifts the read's
          // own exclusion rather than narrowing what came out.
          TrashedFilter.make().label("Deleted"),
          SelectFilter.make("country").label("Country").options(COUNTRIES),
          SelectFilter.make("role").label("Role").options(ROLES),
          TextFilter.make("email").label("Email contains"),
          // Yes, no, and the ordinary page. Three states rather than a checkbox,
          // because "not filtered" and "filtered to false" are different
          // questions and a checkbox can only ask one of them.
          TernaryFilter.make("onCall").label("On call"),
          // Two boxes, one value, one parameter — and the far end is the day
          // asked for included whole, which is the arithmetic that quietly
          // drops the last day of every range when nobody does it.
          DateRangeFilter.make("startsAt").label("Starts").timezone("Europe/Paris"),
          // The same pair of boxes, and both ends inclusive: a number is a
          // point where a day is a span, so there is no day-after to work out.
          NumberRangeFilter.make("rating").label("Rating"),
          // A question no column filter can be asked. `TextFilter` settles its
          // comparison when it is declared, so a reader can change the term and
          // never how it is read. Here the comparison is a field — chosen from
          // a set the server wrote, which is what keeps an operator out of the
          // URL while still letting somebody pick one.
          SchemaFilter.make("named")
            .label("Last name")
            .schema([
              TextInput.make("term").label("Term").placeholder("hop"),
              Select.make("how")
                .label("Read as")
                .options([
                  { value: "contains", label: "Contains" },
                  { value: "starts", label: "Starts with" },
                  { value: "is", label: "Is exactly" },
                ])
                .default("contains"),
            ])
            .query(({ get }) => {
              const term = get("term");
              if (typeof term !== "string" || term.trim() === "") return [];

              const how = get("how");
              const operator =
                how === "starts" ? "startsWith" : how === "is" ? "equals" : "contains";
              return [{ path: "lastName", operator, value: term.trim() }];
            }),
        ])
        // Restore brings a marked row back and asks nothing; force delete leaves
        // nothing to bring back, so it asks first and takes its own policy.
        .actions([
          // In place rather than on a page: "which one is this again" is a
          // question a reader asks without wanting to leave the list they were
          // reading. The same infolist the View page draws, because a resource
          // that has said how a record reads has said it once.
          ViewAction.make().inModal().modalWidth("2xl"),
          EditAction.make(),
          // The address is left behind because the column keeps it unique, and
          // a copy carrying it is a constraint error rather than a row. The
          // boot says so if this line is ever dropped.
          ReplicateAction.make()
            .label("Duplicate")
            .excludeAttributes(["email"])
            .beforeReplicaSaved((replica) => {
              const surname = replica["lastName"];
              return {
                ...replica,
                lastName: typeof surname === "string" ? `${surname} (copy)` : "(copy)",
              };
            }),
          archive,
          remove,
          ActionGroup.make([restore, destroy]).label("Recovery").icon("↩"),
        ])
        // The two that undo and the one that cannot be undone, folded under one
        // word. A selection bar with six buttons is six things to read before
        // pressing any of them, and the two nobody reaches for often are the
        // ones worth putting away.
        .bulkActions([
          archive,
          remove,
          ActionGroup.make([restore, destroy]).label("Recovery").icon("↩"),
        ])
        // What the page says with nothing on it. Without one it says "Nothing
        // to show", which is true and tells a reader nothing they can act on.
        .emptyState({
          heading: "Nobody here",
          description: "Create the first person, or widen the filters above.",
          icon: "\u2691",
        })
        .headerActions([CreateAction.make()])
        .defaultSort("firstName")
    );
  }

  /**
   * The tasks, managed beside the record rather than inside its form.
   *
   * The distinction the example is here to show: the notes above are a
   * `Repeater`, edited in the form and written with the person in one
   * transaction. These are a manager — their own table under the form, their
   * own paging, their own actions, one operation at a time.
   *
   * Nothing here says which tasks. The column that narrows them to this person
   * is derived from the schema at boot and never comes from a request.
   */
  relations(): readonly RelationManager[] {
    return [
      RelationManager.make("tasks")
        .label("Tasks")
        .table((table) =>
          table
            .columns([
              TextColumn.make("title").label("Task").sortable().searchable(),
              IconColumn.make("done").label("Done").boolean(),
            ])
            .defaultSort("title"),
        )
        .form((schema) => schema.schema([TextInput.make("title").required()]))
        .actions([DeleteAction.make().requiresConfirmation()]),
      // Joined rather than owned: a project belongs to no one person, so there
      // is no column here to narrow by and none to fill. It lists, and that is
      // all it may do until attaching and detaching exist — the boot refuses a
      // form or an action on one, rather than drawing a button with nothing
      // behind it.
      RelationManager.make("projects")
        .label("Projects")
        .table((table) =>
          table
            .columns([
              TextColumn.make("name").label("Project").sortable().searchable(),
              TextColumn.make("code").label("Code"),
            ])
            .defaultSort("name"),
        ),
    ];
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
          // The cursor starts here on a create, and the tour marker is a name
          // this panel's own tooling reads — a description, never an
          // instruction, which is the only kind an attribute may be.
          TextInput.make("firstName")
            .label("First name")
            .placeholder("Ada")
            .required()
            .autofocus()
            .extraAttributes({ "data-tour": "first-name" }),
          // Inside the frame, and not in the column: what is stored is what
          // was typed, so nobody has to remember whether the scheme is in
          // there twice.
          // Shaped as it is typed, and kept bare. The mask is what a reader
          // sees; `dehydrateStateUsing` is what the column gets, and the rule
          // behind the mask accepts either — so a row stored before this line
          // existed is not a row that has suddenly become invalid.
          TextInput.make("phone")
            .label("Telephone")
            .mask("(999) 999-9999")
            .dehydrateStateUsing((value) =>
              typeof value === "string" ? value.replace(/\D/g, "") : value,
            )
            .hint("Digits only, in the end"),
          // The row that is not in the list yet, made without leaving this one.
          // What it writes is a `Team`, so it is `TeamResource.can()` that
          // decides whether this reader may — and the boot would refuse this
          // line if no resource stood for that model.
          Select.make("teamId")
            .label("Team")
            .relationship("team", "name")
            .placeholder("Pick a team")
            .createOptionForm(
              Schema.make([TextInput.make("name").label("Name").required()]),
            ),
          TextInput.make("homepage")
            .label("Homepage")
            .prefix("https://")
            .prefixIcon("🌐")
            .placeholder("example.com/ada")
            .hint("Optional"),
          TextInput.make("lastName")
            .label("Last name")
            .placeholder("Lovelace")
            .required(),
          // A word beside the label rather than under the box, because the
          // line under the box belongs to the error — and a reader who has
          // just got the address wrong is the one who most needs to be told
          // what it is for.
          TextInput.make("email")
            .email()
            .placeholder("ada@example.com")
            .required()
            .maxLength(255)
            .hint("Where sign-in links go")
            .hintIcon("✉")
            // The framework's wording is about a shape; this one is about what
            // the address is for. Only the messages the framework wrote can be
            // replaced — a rule a resource writes carries its own words.
            .validationMessages({
              email: "That will not reach anybody. Check the address.",
              required: "Sign-in links need somewhere to go.",
            }),
          // Never shown, never settable from the browser, and written all the
          // same: the value comes from the row or from this default.
          Hidden.make("tenantId").default(1),
        ]),

      Section.make("Where they live").schema([
        // Lighter than a section: two fields that make one answer between them,
        // grouped by the element a browser announces as a group. A section
        // around two fields would say the page has a part called that.
        Fieldset.make("Address")
          .columns(2)
          .description("Stored as codes, and shown as codes.")
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
      ]),

      Section.make("About")
        .collapsible()
        .schema([
          // Every choice on the page at once, several of them taken. A select
          // would hide them behind a click, which is the right trade past a
          // handful and the wrong one here.
          CheckboxList.make("skills")
            .label("Skills")
            .options(SKILLS)
            .columns(2)
            .bulkToggleable()
            .helperText("Whatever they can be asked about."),
          // A list the reader writes rather than picks from, kept in a
          // `String` column joined on commas — which is the shape most tags
          // are already in when a panel meets an existing database.
          TagsInput.make("aliases")
            .label("Also known as")
            .separator(",")
            .suggestions(["Countess", "Enchantress of Numbers"])
            .placeholder("Type a name and press Enter"),
          // A `Json` column, edited as the pairs it stands for rather than as
          // the object it is: a key typed as an object key is deleted and
          // re-added on every keystroke, and the cursor goes with it.
          KeyValue.make("links")
            .label("Links")
            .keyLabel("Name")
            .valueLabel("Address")
            .helperText("Kept as one JSON column."),
          // A document rather than a string of HTML: what the column keeps is
          // the tree the editor makes, and what the boundary admits is what
          // these buttons can produce.
          RichEditor.make("story")
            .label("Story")
            .toolbar(["bold", "italic", "link", "h2", "bulletList", "blockquote"])
            .helperText("Kept as a document, not as HTML."),
          // The other way round from the story above it. Markdown is text in
          // the column and text on the wire, so there is nothing to convert
          // and nothing to sanitise: the preview draws elements from a tree,
          // never markup from a string.
          MarkdownEditor.make("readme")
            .label("Notes")
            .rows(8)
            .maxLength(2000)
            .placeholder("Write in markdown. Switch to Preview to see it.")
            .helperText("Kept as text. The preview draws what the buttons write."),
          Textarea.make("bio")
            .label("Biography")
            .rows(4)
            .autosize()
            .maxLength(280)
            .placeholder("A line or two about them.")
            .helperText("Counted in characters, and refused on the server too."),
          Radio.make("role").label("Role").options(ROLES).inline(),
          // The same closed set as the radios above, in clothes a thumb can
          // hit: joined into one block, which is what "one of these" looks
          // like when the choices are a word each.
          ToggleButtons.make("access")
            .label("Access")
            .options(ACCESS)
            .grouped()
            .helperText("What they may do here."),
        ]),

      // Static content, which is neither a control nor a reading of the row:
      // the sentence between two sections rather than a field with a label.
      Text.make(
        "Everything below is saved together. Tasks are their own, under the tabs.",
      ),
      // A field this framework does not ship, drawn by a script the panel
      // loads. Nothing in `@perchjs/*` has heard of a star.
      Stars.make("rating").label("Rating").most(5),
      Callout.make("Before you edit")
        .tone("warning")
        .description(({ get }) =>
          get("active") === true
            ? "This person can sign in. Changes take effect immediately."
            : "This person cannot sign in, so nothing here reaches them yet.",
        ),
      Section.make("Status")
        .columns(2)
        .schema([
          // A grid rather than a fieldset: these two belong side by side and
          // have nothing to be called between them. A fieldset would name a
          // group that is only a layout.
          Grid.make(2).schema([
            // Live, because the callout above says something different about a
            // person who cannot sign in. A resolvable line only tracks a field
            // that asks the server when it changes.
            Toggle.make("active").label("Active").onColor("success").live(),
            Checkbox.make("onCall").label("On call this week").inlineLabel(),
          ]),
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

      // Two panels, one at a time. A section for each would put both on the
      // page and make it longer; tabs say these are alternatives rather than
      // parts, and the one that is open is remembered in the address.
      Tabs.make().tabs([
        Tab.make("Photo").schema([
          FileUpload.make("avatar")
            .label("Avatar")
            .image()
            .maxSize(2 * 1024 * 1024)
            .directory("avatars")
            .helperText("Goes up when you choose it; kept when you save."),
          // The page holds hex, because that is what a colour control speaks.
          // The column holds `hsl()`, because this one was told to.
          ColorPicker.make("tint")
            .label("Tint")
            .hsl()
            .placeholder("#21594a")
            .helperText("Picked as hex, kept as hsl()."),
        ]),
        Tab.make("Badge")
          .icon("🐦")
          .schema([
            // Static content: neither a control nor a reading of the row.
            Icon.make("🐦").tone("success"),
            Text.make("What the panel puts beside this person's name."),
            // The alternative first, because it is not optional: a picture
            // with nothing said instead of it is one a reader who cannot see
            // it is never told about.
            Image.make("The house style", "/files/avatars/ada.png"),
          ]),
      ]),
    ]);
  }
}
