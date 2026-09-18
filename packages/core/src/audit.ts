/**
 * What a declaration promises and cannot keep.
 *
 * A fluent builder cannot judge this on its own: `.searchable()` before
 * `.relationship()` and after it are the same field, and a method that throws
 * only sees the half of the chain written before it. So the reading happens
 * once, on the finished tree, where the order it was written in no longer
 * exists.
 *
 * This runs at boot and it is loud. Everything the trust boundary refuses in
 * silence is refused because a client asked for it; everything here is a line
 * of somebody's own form, and the only useful answer is which line.
 */
import type { Column } from "./column.js";
import { WritableColumn } from "./column.js";
import type { Component } from "./component.js";
import { isResolver } from "./component.js";
import { normaliseOptions } from "./option.js";
import { ActionGroup, CreateAction, everyAction, MODAL_WIDTHS } from "./action.js";
import { ICON_NAMES, isIconName } from "./icon.js";
import { Entry } from "./entry.js";
import { TextEntry } from "./entries/text-entry.js";
import type { RuleKind } from "./field.js";
import { Field } from "./field.js";
import { Layout, Tab, Tabs } from "./layout.js";
import { Hidden } from "./fields/hidden.js";
import { DateTimePicker } from "./fields/date-time-picker.js";
import { FileUpload } from "./fields/file-upload.js";
import { CheckboxList } from "./fields/checkbox-list.js";
import { KeyValue } from "./fields/key-value.js";
import { TagsInput } from "./fields/tags-input.js";
import { MARKDOWN_TOOLS, MarkdownEditor } from "./fields/markdown-editor.js";
import { Radio } from "./fields/radio.js";
import { RICH_EDITOR_TOOLS, RichEditor } from "./fields/rich-editor.js";
import { ToggleButtons } from "./fields/toggle-buttons.js";
import { Repeater } from "./fields/repeater.js";
import { Select } from "./fields/select.js";
import { charactersIn, isPlaceholder, TextInput } from "./fields/text-input.js";
import { Schema } from "./layout.js";
import {
  DateRangeFilter,
  SchemaFilter,
  SelectFilter,
  TrashedFilter,
} from "./filter.js";
import type { Table } from "./table.js";
import { declaredActions, declaredFilters } from "./table.js";
import { isWallClock, knownZone } from "./zoned.js";

export interface Complaint {
  /** The field's name, or its position when it has none. */
  readonly field: string;
  readonly problem: string;
}

export function auditSchema(root: Component): readonly Complaint[] {
  const complaints: Complaint[] = [];
  walk(root, complaints);
  inspectPaths(root, complaints);

  // A hook may `set()` any path at all, and what it sets is opaque from here.
  // So the hidden-field complaint below is only made where nothing in the form
  // could possibly be filling one: certain, rather than probable. A boot that
  // stops a working form is worse than one that misses a broken one.
  if (!anyHook(root)) {
    for (const field of hiddenFields(root)) {
      if (field.state.defaultValue !== undefined) continue;
      complaints.push({
        field: named(field),
        problem:
          "has no default, and a hidden field takes its value from the row or " +
          "from one — so a create would write nothing for it",
      });
    }
  }

  return complaints;
}

/**
 * What an infolist promises and cannot keep.
 *
 * Separate from `auditSchema`, which a form goes through too and where a field
 * is the whole point. Here one is a control on a page with nowhere to send it:
 * measured before this existed, a `TextInput` in an infolist drew an empty
 * editable box — empty because the View page sends no state — that a reader can
 * type into and that nothing will ever save.
 */
export function auditInfolist(root: Component): readonly Complaint[] {
  const complaints: Complaint[] = [];
  const walk = (component: Component): void => {
    if (component instanceof Field) {
      complaints.push({
        field: named(component),
        problem:
          "is a field in an infolist, so it would draw a control on a page " +
          "with nothing to save it — an entry is what shows a value",
      });
      return;
    }
    if (component instanceof TextEntry) inspectLimit(component, complaints);
    // Asked here as well as in the schema's walk, because these are two walks
    // and not one: a section, a tab and an `Icon` are declared on both sides,
    // and a mark refused on a form while it went through on an infolist is a
    // closed set with a door in it.
    inspectIcon(component, complaints);
    inspectSends(component, complaints);
    inspectColumns(component, complaints);
    for (const child of component.children) walk(child);
  };
  walk(root);
  return complaints;
}

/**
 * A separator that is not a character.
 *
 * `"ada".includes("")` is true, so an empty one matches every tag there is and
 * the field admits nothing at all — silently, and for every value a reader can
 * type. The third value in this file that reads as configuration and disables
 * the thing it configures; the other two are a limit of zero and a count of
 * zero columns.
 */
function inspectPairLabels(field: KeyValue, into: Complaint[]): void {
  const { keyLabel, valueLabel } = field.state;
  for (const [method, given] of [
    ["keyLabel", keyLabel],
    ["valueLabel", valueLabel],
  ] as const) {
    if (given === undefined || given.trim() !== "") continue;
    into.push({
      field: named(field),
      problem: `names a column with nothing in .${method}(), which leaves the heading blank and the boxes under it named only by their row`,
    });
  }
}

/**
 * A path claimed by two fields.
 *
 * The state is one map keyed by path, so the second field to claim one is a
 * field with no value: it draws, it takes a place on the page, and nothing ever
 * reaches it. Silence is what makes it expensive — the form looks right, and
 * the reader finds out by saving.
 *
 * Scoped rather than global, because a repeater's rows namespace their fields
 * by row: `body` inside one and `body` outside it are two paths.
 */
function inspectPaths(root: Component, into: Complaint[]): void {
  for (const scope of scopes(root)) {
    const seen = new Set<string>();
    for (const name of scope) {
      if (name === "") continue;
      if (seen.has(name)) {
        into.push({
          field: name,
          problem:
            "is declared twice in one form, and the state has one entry per " +
            "path — so only one of the two can hold a value and neither says which",
        });
        continue;
      }
      seen.add(name);
    }
  }
}

/** The field names of each place a path means one thing: the form, and each row. */
function scopes(component: Component): readonly (readonly string[])[] {
  const here: string[] = [];
  const below: (readonly string[])[] = [];

  const visit = (one: Component): void => {
    // A repeater's schema is its own place: what its rows call a field is a
    // path under the row, not beside this one.
    if (one instanceof Repeater) {
      below.push(...scopes(one));
      return;
    }
    if (one instanceof Field) here.push(one.name);
    for (const child of one.children) visit(child);
  };

  for (const child of component.children) visit(child);
  return [here, ...below];
}

/** Every field in a filter's schema, however it is laid out. */
function fieldsOf(components: readonly Component[]): readonly Field[] {
  return components.flatMap((one) => [
    ...(one instanceof Field ? [one] : []),
    ...fieldsOf(one.children),
  ]);
}

/**
 * Whether a field can hold what a link can carry.
 *
 * The same two-question shape a writable column uses. A field offering a closed
 * set is asked about its own first choice written as text, because that is what
 * a query string will hand back; anything else is asked whether it takes a word
 * at all. A document, a list of pairs and a set of ticks all say no, which is
 * the answer that matters — a control drawn over one of them would take a
 * reader's input and narrow nothing.
 */
function readsText(field: Field): boolean {
  const declared = field.declaredOptions;
  if (declared !== undefined && !isResolver(declared)) {
    const options = normaliseOptions(declared);
    return (
      options.length > 0 &&
      field.admits(String(options[0]?.value), options) === undefined
    );
  }
  return field.admits("perch", undefined) === undefined;
}

function inspectMarkdownToolbar(field: MarkdownEditor, into: Complaint[]): void {
  const unknown = field.state.toolbar.filter((tool) => !MARKDOWN_TOOLS.includes(tool));
  if (unknown.length === 0) return;

  into.push({
    field: named(field),
    problem:
      `asks for ${unknown.join(", ")} in its toolbar, and no button is drawn ` +
      `for that. What there is: ${MARKDOWN_TOOLS.join(", ")}`,
  });
}

function inspectToolbar(field: RichEditor, into: Complaint[]): void {
  const unknown = field.state.toolbar.filter(
    (tool) => !RICH_EDITOR_TOOLS.includes(tool),
  );
  if (unknown.length === 0) return;

  into.push({
    field: named(field),
    problem:
      `asks for ${unknown.join(", ")} in its toolbar, and no button is drawn ` +
      `for that. What there is: ${RICH_EDITOR_TOOLS.join(", ")}`,
  });
}

function inspectSeparator(field: TagsInput, into: Complaint[]): void {
  const { separator } = field.state;
  if (separator === undefined || separator !== "") return;

  into.push({
    field: named(field),
    problem:
      "is joined on nothing, which every tag contains — so the field would " +
      "refuse every value there is",
  });
}

/**
 * A count of columns nothing can be laid out in.
 *
 * The number reaches the stylesheet as `repeat(n, …)`, where anything but a
 * whole number above zero is invalid — so the declaration is dropped and the
 * grid quietly falls back to one column. A value that reads as configuration
 * and configures nothing, which is the shape a step of zero and a limit of
 * zero already get refused for.
 *
 * Both shapes, because a responsive count is two numbers and either can be the
 * wrong one.
 */
function inspectColumns(component: Component, into: Complaint[]): void {
  const declared: unknown =
    component instanceof Layout || component instanceof CheckboxList
      ? component.state.columns
      : undefined;
  if (declared === undefined) return;

  const counts =
    typeof declared === "number"
      ? [declared]
      : Object.values(declared as Record<string, unknown>);

  for (const count of counts) {
    if (typeof count === "number" && Number.isInteger(count) && count > 0) continue;
    into.push({
      field: named(component),
      problem:
        `is laid out in \`${String(count)}\` columns, which is not a number of ` +
        "columns — it has to be a whole number above zero",
    });
    return;
  }
}

/**
 * What a complaint calls a component, named or not.
 *
 * One spelling. There were ten, each written where it was needed, and three of
 * them read the name without allowing for its being absent — which a layout's
 * is, whenever nobody titled it.
 */
function named(component: Component): string {
  const name = component.name;
  return name === undefined || name === "" ? `an unnamed ${component.type}` : name;
}

/**
 * A prop that will not survive the trip.
 *
 * What a component declares as sent is copied onto the payload, and the shell
 * puts the payload through `JSON.stringify`. A value that throws there — a
 * structure that refers to itself, a `BigInt` — takes the page down with a
 * stack trace about JSON, from a declaration nothing questioned.
 *
 * Read here rather than trusted, and at the one moment somebody is watching:
 * the state is fixed when the component is declared, so this is knowable long
 * before a reader asks for the page.
 */
function inspectSends(component: Component, into: Complaint[]): void {
  const state = component.state as unknown as Record<string, unknown>;

  for (const key of component.sends) {
    const value = state[key];
    // Both are dropped by the serialiser rather than sent, so neither reaches
    // anything that could break on them.
    if (value === undefined || typeof value === "function") continue;

    try {
      JSON.stringify(value);
    } catch {
      into.push({
        field: `${component.type}.${key}`,
        problem:
          "is sent to the browser and cannot be turned into JSON — the page " +
          "carrying it fails to render at all",
      });
    }
  }
}

/**
 * A mark the panel has no drawing for, as the complaint about it — or nothing.
 *
 * A closed set is only closed where something closes it. The union holds while
 * the resource is written in TypeScript; a plugin written in JavaScript, or one
 * cast, puts any string on the wire — and the renderer finds no drawing, so the
 * mark is simply absent from a screen with nothing to say a declaration was
 * ignored. That is the same silence a modal width had before it was refused.
 *
 * Exported, and returning the complaint rather than pushing it, because not
 * every mark is asked for by a component. A resource names one for the menu in
 * its decorator, which is part of no tree and cannot reach the walk below — and
 * two wordings for one refusal are two things a reader has to work out are the
 * same refusal.
 */
export function refuseIcon(named: unknown, field: string): readonly Complaint[] {
  if (typeof named !== "string" || isIconName(named)) return [];

  return [
    {
      field,
      problem:
        `asks for the \`${named}\` icon, which the panel has no drawing for — ` +
        `one of: ${ICON_NAMES.join(", ")}`,
    },
  ];
}

/**
 * Every option on a component that names a mark.
 *
 * A list, and read off any component through one cast, rather than six
 * `instanceof`s: only a text input has affixes, only a toggle has the two in
 * its knob, only a layout has one beside a title. Each sits beside a different
 * word and is drawn at a different size, and each is the same set of names
 * refused the same way.
 *
 * The list is the point. Four of these went unread for a while, each somewhere
 * nobody thought to look, and every one of them was a mark that simply vanished
 * from a screen with nothing said. A seventh gets added here, and
 * `icon-options.test.ts` is what will not let it be added anywhere else.
 */
export const MARK_OPTIONS = [
  "icon",
  "icons",
  "hintIcon",
  "prefixIcon",
  "suffixIcon",
  "onIcon",
  "offIcon",
] as const;

function inspectIcon(component: Component, into: Complaint[]): void {
  // Through `unknown`, the way the wire format reads a state by key: the two
  // types do not overlap enough for TypeScript to take the claim on its own,
  // and every value read here is checked before it is used anyway.
  const state = component.state as unknown as Readonly<Record<string, unknown>>;
  // The label may itself be a resolver, and a complaint needs a word now: the
  // type is what a reader can always be pointed at.
  const label = component.state.label;
  const field = typeof label === "string" ? label : component.type;
  for (const option of MARK_OPTIONS) {
    into.push(...refuseIcon(state[option], field));
  }
}

/**
 * An empty state that says nothing.
 *
 * Declaring one takes the plain fallback away — "Nothing to show" is short and
 * true — so one with none of the three leaves a blank box where a table was.
 * The same shape as a limit of zero: a value that reads as "configure this" and
 * un-configures it.
 */
function inspectEmpty(table: Table, into: Complaint[]): void {
  const empty = table.state.empty;
  if (empty === undefined) return;
  // Not a component, so no walk reaches it: the empty state is three static
  // strings hanging off the table, and its mark is drawn on the one page a
  // reader is most likely to think is broken.
  into.push(...refuseIcon(empty.icon, "the empty state"));
  if (
    empty.heading !== undefined ||
    empty.description !== undefined ||
    empty.icon !== undefined
  ) {
    return;
  }

  into.push({
    field: "the empty state",
    problem:
      "says nothing at all, and declaring one takes away the plain words the " +
      "table would have used — leaving a blank box where a table was",
  });
}

/**
 * A length nothing can be shortened to.
 *
 * Zero or less reads as "show none of it" and does the opposite: the renderer
 * cannot cut a string to nothing and leave an ellipsis meaning anything, so it
 * shows the whole value. A declaration that quietly does the reverse of what it
 * says is worse than one that stops the boot.
 */
function inspectLimit(entry: TextEntry, into: Complaint[]): void {
  const { limit } = entry.state;
  if (limit === undefined) return;
  if (Number.isInteger(limit) && limit > 0) return;

  into.push({
    field: named(entry),
    problem:
      `has a limit of \`${String(limit)}\`, which is not a length a value can be ` +
      "shortened to — a limit has to be a whole number above zero",
  });
}

function inspectStep(input: TextInput, into: Complaint[]): void {
  const { step } = input.state;
  if (step === undefined) return;
  if (Number.isFinite(step) && step > 0) return;

  into.push({
    field: named(input),
    problem:
      `has a step of \`${String(step)}\`, which is not a grain a value can ` +
      "come in — a step has to be a positive number",
  });
}

function anyHook(component: Component): boolean {
  if (component instanceof Field && component.state.afterStateUpdated !== undefined) {
    return true;
  }
  return component.children.some(anyHook);
}

function hiddenFields(component: Component): readonly Hidden[] {
  return [
    ...(component instanceof Hidden ? [component] : []),
    ...component.children.flatMap(hiddenFields),
  ];
}

function walk(component: Component, into: Complaint[]): void {
  inspectIcon(component, into);
  inspectSends(component, into);
  inspectColumns(component, into);
  if (component instanceof Select) inspectSelect(component, into);
  if (component instanceof DateTimePicker) inspectDates(component, into);
  // A step of zero divides; a negative one has no meaning. Either way the rule
  // it implies would answer `true` to everything, which is a limit that reads
  // as declared and refuses nothing.
  if (component instanceof TextInput) inspectStep(component, into);
  if (component instanceof TagsInput) inspectSeparator(component, into);
  // A button no editor can draw is a word in a list and nothing else.
  if (component instanceof RichEditor) inspectToolbar(component, into);
  // The same reading for the other editor: a button nothing draws is a word.
  inspectAttributes(component, into);
  if (component instanceof Field) inspectMessages(component, into);
  if (component instanceof TextInput) inspectMask(component, into);
  if (component instanceof MarkdownEditor) inspectMarkdownToolbar(component, into);
  // A column named with nothing is a heading that draws blank and a box whose
  // only name is the row it is on — declared, and naming nothing.
  if (component instanceof KeyValue) inspectPairLabels(component, into);
  // A media type nothing can match is a filter that refuses everything, and a
  // reader whose file is turned away is told only that it was.
  if (component instanceof FileUpload) inspectUpload(component, into);
  // Every choice is on the page, so there is no relation and no window to
  // excuse an empty list: the boundary would refuse every value a reader picks.
  // Both of them, from one check — a select is the one that has somewhere else
  // its values could come from, and these two do not.
  if (
    (component instanceof Radio ||
      component instanceof CheckboxList ||
      component instanceof ToggleButtons) &&
    component.declaredOptions === undefined
  ) {
    into.push({
      field: named(component),
      problem: "has no options, so it offers nothing and would refuse anything",
    });
  }
  // A set of panels with no panels draws nothing at all, and a panel that is
  // not one is drawn as a tab named after whatever it is, opening on an empty
  // box. Both read on screen as a layout that failed rather than as a form.
  if (component instanceof Tabs) {
    const name = named(component);
    if (component.children.length === 0) {
      into.push({
        field: name,
        problem: "has no panels, so it draws nothing",
      });
    }
    for (const child of component.children) {
      if (child instanceof Tab) continue;
      into.push({
        field: child.name === "" || child.name === undefined ? child.type : child.name,
        problem:
          `is a \`${child.type}\` directly inside a \`Tabs\`, which holds panels — ` +
          "it would be drawn as a tab named after itself, opening on nothing",
      });
    }
  }
  // A row is a section that happens many times; with no children it is a
  // section that happens many times and shows nothing.
  if (component instanceof Repeater && component.children.length === 0) {
    into.push({
      field: named(component),
      problem: "has nothing to repeat, so every row it added would be blank",
    });
  }
  // An entry reads the record it was resolved against, and a repeater's row is
  // not that record. Left alone it shows the parent's value on every row —
  // plausible, wrong, and never reported by anything.
  if (component instanceof Repeater) {
    for (const entry of entriesIn(component)) {
      into.push({
        field: entry.recordPath === "" ? "an unnamed entry" : entry.recordPath,
        problem:
          "is an entry inside a repeater, so it would read the record rather " +
          "than the row it is drawn in, and show the same value on every one",
      });
    }
  }
  for (const child of component.children) walk(child, into);
}

/** Entries at this level. A nested repeater has already made its own case. */
function entriesIn(component: Component): readonly Entry[] {
  return component.children.flatMap((child) =>
    child instanceof Repeater
      ? []
      : [...(child instanceof Entry ? [child] : []), ...entriesIn(child)],
  );
}

/**
 * A bound has to be shaped like the values it bounds.
 *
 * They are compared as text, which is what ISO ordering is for — but only
 * between two strings of the same shape. `"2026-06-01" >= "2026-06-01T00:00"`
 * is false, because the shorter one is a prefix, so a date-only field bounded
 * with a time refuses the very first day it should allow and says so with an
 * hour the field cannot even show.
 */
function inspectDates(picker: DateTimePicker, into: Complaint[]): void {
  const name = named(picker);
  const { withTime, minDate, maxDate, timezone } = picker.state;
  const wanted = withTime ? "YYYY-MM-DDTHH:mm" : "YYYY-MM-DD";

  if (!knownZone(timezone)) into.push(unknownZone(name, timezone));

  for (const [which, bound] of [
    ["minDate", minDate],
    ["maxDate", maxDate],
  ] as const) {
    if (bound === undefined) continue;
    // Held before the check narrows it: `WallClock` is an alias of `string`, so
    // the predicate leaves `never` behind on the branch that needs to name it.
    const shown: string = bound;
    if (isWallClock(bound, withTime)) continue;
    into.push({
      field: name,
      problem:
        `has a \`${which}\` of \`${shown}\`, which is not shaped like the values it ` +
        `bounds — this field holds \`${wanted}\``,
    });
  }
}

/**
 * A zone nothing has heard of.
 *
 * `Intl` throws on one rather than falling back to anything, so this is not a
 * date drawn an hour out — it is every request that touches the control
 * failing, with a stack trace naming a formatter instead of the line that was
 * mistyped.
 */
function unknownZone(name: string, zone: string): Complaint {
  return {
    field: name,
    problem:
      `keeps its days in \`${zone}\`, which this runtime has never heard of — ` +
      "an IANA name, like `Europe/Paris` or `UTC`",
  };
}

/**
 * An attribute a declaration asked to put on a control.
 *
 * `data-*` and `aria-*` describe; `title` and `role` describe. Everything else
 * in that namespace may instruct: `on*` runs code, `style` is a stylesheet,
 * `href` and `src` and `formaction` are addresses. A resource is server code
 * and therefore trusted — and a declaration that builds an attribute out of
 * something a request supplied is one refactor away from being written, which
 * is why the refusal lives where the attribute is made rather than in whoever
 * remembers.
 */
const DESCRIBING = /^(?:data-[a-z][\w.:-]*|aria-[a-z-]+|title|role)$/;

/**
 * What a cell already says about itself, and what an author may not overwrite.
 *
 * `data-label` is how a row becomes a stack on a narrow screen: each cell
 * carries the heading it would have had. An attribute taking that name leaves
 * the column unlabelled exactly where the label is the only thing naming it.
 */
const CELL_BINDINGS = new Set(["data-label", "class", "style"]);

/**
 * A message for a limit the field does not have.
 *
 * `.validationMessages({ maxLength: "…" })` on a field with no maximum is a
 * sentence nobody will ever read, and it looks exactly like one that works —
 * the field validates, the form saves, and the words sit in the declaration
 * waiting for a limit that was never added.
 *
 * `required` is asked of the field rather than of its rules, because it is not
 * one: it is checked before them and worded on its own.
 */
function inspectMessages(field: Field, into: Complaint[]): void {
  const said = field.state.validationMessages;
  if (said === undefined) return;

  const kinds = new Set(
    field.declaredRules.flatMap((rule) => (rule.kind === undefined ? [] : [rule.kind])),
  );
  if (field.state.required !== undefined) kinds.add("required");

  for (const kind of Object.keys(said) as RuleKind[]) {
    if (kinds.has(kind)) continue;
    into.push({
      field: named(field),
      problem:
        `says what to put instead of the \`${kind}\` message, and declares no ` +
        `\`${kind}\` — nothing would ever say it`,
    });
  }
}

/**
 * A mask that cannot be read back out of a value.
 *
 * The rule strips the literals before comparing, so a value may arrive with the
 * punctuation or without it. That only works while the literals are punctuation:
 * a mask whose literal is a letter or a digit cannot be told from a position the
 * reader filled, and both readings are wrong for some value.
 *
 * A mask with no placeholder at all is the other end of it — a shape that
 * admits nothing but itself, drawn as a box the reader cannot type into.
 */
function inspectMask(field: TextInput, into: Complaint[]): void {
  const mask = field.state.mask;
  if (mask === undefined) return;

  const literals = charactersIn(mask).filter((one) => !isPlaceholder(one));
  const alphanumeric = literals.filter((one) => /[a-z0-9]/i.test(one));
  if (alphanumeric.length > 0) {
    into.push({
      field: named(field),
      problem:
        `has \`${alphanumeric.join("`, `")}\` in its mask as something the reader ` +
        "does not type, and a letter or a digit there cannot be told from one " +
        "they do — `9` is a digit, `a` a letter, `*` either, and the rest is " +
        "punctuation",
    });
  }
  if (literals.length === mask.length) {
    into.push({
      field: named(field),
      problem: "has a mask with nothing in it to fill — `9`, `a` or `*`",
    });
  }

  // A mask fixes the length exactly, and the value carries the punctuation the
  // box writes. `.mask("(999) 999-9999").maxLength(10)` reads as ten digits and
  // is a box the reader cannot fill: the browser stops them at `(555) 123-` and
  // the rule refuses a complete number. Nothing on screen would say why.
  const limits = (["minLength", "maxLength"] as const).filter(
    (one) => field.state[one] !== undefined,
  );
  if (limits.length > 0) {
    into.push({
      field: named(field),
      problem:
        `sets \`${limits.join("`, `")}\` beside a mask, which already fixes the ` +
        "length — and counts the punctuation the mask writes, so a limit meant " +
        "for what is typed makes a box that cannot be filled",
    });
  }
}

function inspectAttributes(component: Component, into: Complaint[]): void {
  const extra = component.state.extraAttributes;
  if (extra === undefined) return;

  for (const name of Object.keys(extra)) {
    if (DESCRIBING.test(name)) continue;
    into.push({
      field: named(component),
      problem:
        `puts \`${name}\` on its control, and a control takes only attributes ` +
        "that describe it — `data-*`, `aria-*`, `title`, `role`. The rest of " +
        "that namespace tells a browser to do something",
    });
  }
}

function inspectUpload(upload: FileUpload, into: Complaint[]): void {
  const name = named(upload);
  const types = upload.state.acceptedFileTypes;
  if (types === undefined) return;

  if (types.length === 0) {
    into.push({
      field: name,
      problem: "accepts an empty list of media types, so it would refuse every file",
    });
    return;
  }

  for (const pattern of types) {
    // `image/*` is a family. `*` alone is the absence of a rule dressed as one,
    // and `image` with no slash matches nothing at all.
    if (/^[\w.+-]+\/(\*|[\w.+-]+)$/.test(pattern)) continue;
    into.push({
      field: name,
      problem: `accepts \`${pattern}\`, which is not a media type — it would match nothing`,
    });
  }
}

function inspectSelect(select: Select, into: Complaint[]): void {
  const name = named(select);
  const { options, relationship, searchable } = select.state;

  // The route that answers typing resolves a relation and searches its label
  // field. With nothing to resolve there is nothing it could ever answer, and
  // the field renders a search box that returns the list it already had.
  if (searchable && relationship === undefined) {
    into.push({
      field: name,
      problem:
        "is searchable but names no relationship, and searching a declared " +
        "list is filtering it — which the browser already does",
    });
  }

  // Since the boundary closed, a select with nothing declared accepts nothing:
  // every value a reader picks would be refused, and the form would look
  // broken with no error to explain it.
  if (options === undefined && relationship === undefined) {
    into.push({
      field: name,
      problem: "has neither options nor a relationship, so it can hold nothing at all",
    });
  }

  const creates = select.state.createOptionForm;
  if (creates === undefined) return;

  // A declared list is a list this code wrote. There is no table behind it to
  // write a row into, and the option would live until the page was reloaded.
  if (relationship === undefined) {
    into.push({
      field: name,
      problem:
        "offers to create an option and names no relationship — a declared " +
        "list has no table behind it, so the new option would last until the " +
        "page was reloaded",
    });
  }

  // A dialog that opens on nothing, with a button underneath it that would
  // write a row with no values in it.
  if (creates.state.children.length === 0) {
    into.push({
      field: name,
      problem: "carries a form with no fields to create an option with",
    });
  }
}

/**
 * The same reading, for the table half of a resource.
 *
 * A filter has the same way of going quiet as a field: declared, serialised,
 * and answering nothing. The renderer draws no control for a choice with
 * nothing to choose from, so without this the only sign is a filter that never
 * appears.
 */
/**
 * A table where every column starts off.
 *
 * A reader who opens it finds a heading row and nothing under it, and the only
 * way back is a menu they have to know is there. One column that stays is what
 * makes the rest optional rather than the table.
 */
function inspectHidden(table: Table, into: Complaint[]): void {
  const columns = table.state.columns;
  if (columns.length === 0) return;

  const showing = columns.filter(
    (column) => column.state.toggleable?.hiddenByDefault !== true,
  );
  if (showing.length > 0) return;

  into.push({
    field: table.state.columns[0]?.state.path ?? "the table",
    problem:
      "is in a table whose every column is hidden by default, so it opens on " +
      "a heading row with nothing under it — one column has to stay",
  });
}

export function auditTable(table: Table): readonly Complaint[] {
  // Two under one name is already refused — but on the first request that names
  // one, under a reader. Asking here brings it forward to the boot.
  declaredFilters(table);
  declaredActions(table);

  const complaints: Complaint[] = [];
  inspectEmpty(table, complaints);
  inspectHidden(table, complaints);
  for (const column of table.state.columns) {
    inspectCellAttributes(column, complaints);
    inspectComputed(column, complaints);
  }

  // Two of them under two names, which the name check above cannot see. They
  // decide one thing between them, so a reader can set them against each other
  // and the answer is whichever was declared last — arbitrary, and invisible.
  const trashed = table.state.filters.filter((one) => one instanceof TrashedFilter);
  if (trashed.length > 1) {
    complaints.push({
      field: trashed.map((one) => one.state.name).join(", "),
      problem:
        "are two filters deciding which rows the list reads, and a reader can " +
        "set them against each other — one table has one such question",
    });
  }

  for (const filter of table.state.filters) {
    // `.path()` names the column a filter narrows, and this one narrows none.
    // Accepted, stored and acted on by nothing, which is how a line that reads
    // like a decision turns out to have been one nobody kept.
    if (filter instanceof TrashedFilter && filter.state.path !== filter.state.name) {
      complaints.push({
        field: filter.state.name,
        problem:
          `points at \`${filter.state.path}\`, and a filter for deleted rows ` +
          "reads no column — it decides which rows are read at all",
      });
    }
    if (filter instanceof DateRangeFilter && !knownZone(filter.state.timezone)) {
      complaints.push(unknownZone(filter.state.name, filter.state.timezone));
    }
    if (filter instanceof SchemaFilter) {
      // The two halves of the same declaration. Fields with nothing to mean
      // draw a form that narrows nothing however it is filled in; a meaning
      // with no fields is a control nobody can operate.
      if (filter.state.schema.length === 0) {
        complaints.push({
          field: filter.state.name,
          problem: "carries a form with no fields in it, so there is nothing to ask",
        });
      }
      if (filter.state.query === undefined) {
        complaints.push({
          field: filter.state.name,
          problem:
            "has no `query()`, so whatever a reader puts in it narrows nothing " +
            "at all",
        });
      }
      // Its values travel in a query string, so a field that cannot hold what
      // one carries is a control a reader can operate and nothing can read.
      // Asked of the field rather than listed by type, so a field this file has
      // never heard of answers for itself.
      for (const field of fieldsOf(filter.state.schema)) {
        if (readsText(field)) continue;
        complaints.push({
          field: `${filter.state.name}.${field.name}`,
          problem:
            `is a \`${field.type}\`, and a filter's values arrive as text out of ` +
            "a link — what it holds could never be written in one",
        });
      }
      // Its fields are fields, and they go through the same cycle a form's do
      // — so a declaration that would be refused on a page has to be refused
      // here. Without this a `Select` with no options, or a picker naming a
      // zone nothing has heard of, boots clean inside a filter and fails or
      // does nothing on the first request that touches it.
      for (const inside of auditSchema(Schema.make([...filter.state.schema]))) {
        complaints.push({
          field: `${filter.state.name}.${inside.field}`,
          problem: inside.problem,
        });
      }
    }
    if (filter instanceof SelectFilter && filter.choices.length === 0) {
      complaints.push({
        field: filter.state.name,
        problem:
          "is a choice with nothing to choose from, so it can never filter anything",
      });
    }
  }

  // An action nobody implemented draws a button that does nothing when pressed,
  // which is worse than no button: the reader has no way to tell it apart from
  // one that failed silently. The ready-made ones are exempt because the route
  // is what carries them out.
  // A group answers to its label, the way an action answers to its name, and
  // both end up in one list on the wire. Two entries under one word is the
  // ambiguity `declaredActions` refuses for actions — said here for groups,
  // which it never sees, and for a group standing where an action already is.
  for (const [where, list] of [
    ["row", table.state.actions],
    ["header", table.state.headerActions],
    ["selection", table.state.bulkActions],
  ] as const) {
    const seen = new Map<string, number>();
    for (const one of list) {
      const name =
        one instanceof ActionGroup ? one.state.label : (one.state.name ?? one.type);
      seen.set(name, (seen.get(name) ?? 0) + 1);
    }
    for (const [name, count] of seen) {
      if (count < 2) continue;
      complaints.push({
        field: name,
        problem:
          `is the name of ${String(count)} entries in this table's ${where} ` +
          "actions, and a list cannot offer two things under one word",
      });
    }
  }

  // What a header offers is one thing today: a link to the create page. A run
  // there would have no record to act on — the route loads a selection, and a
  // header has none — and a link anywhere else is an address the client cannot
  // build. Both were drawn by nobody and said nothing, which is the silence
  // this file exists to break.
  for (const one of table.state.headerActions) {
    const named =
      one instanceof ActionGroup ? one.state.label : (one.state.label ?? one.type);
    const isCreate = !(one instanceof ActionGroup) && one instanceof CreateAction;
    if (isCreate) continue;
    complaints.push({
      field: named,
      problem:
        "is a header action that is not a `CreateAction`, and a header draws " +
        "nothing else — a run there has no record to act on, and any other " +
        "link is an address the client cannot build",
    });
  }

  // Groups opened out: what the boot asks is about the actions, and a group
  // that hid one from these questions would be a place to put a broken one.
  for (const action of everyAction([
    ...table.state.actions,
    ...table.state.headerActions,
    ...table.state.bulkActions,
  ])) {
    if (action.state.run === undefined && !action.isBuiltIn) {
      complaints.push({
        field: action.state.label ?? action.type,
        problem: "has no `action()`, so pressing it would do nothing at all",
      });
    }
    // A closed set is only closed where something closes it. The union holds
    // while the resource is written in TypeScript; a plugin written in
    // JavaScript, or one cast, puts any string on the wire — and the stylesheet
    // finds no rule for it, falls back to the default width, and opens a panel
    // that is not the one the declaration asked for with nothing to say so.
    const width = action.state.modalWidth;
    if (width !== undefined && !MODAL_WIDTHS.includes(width)) {
      complaints.push({
        field: action.state.label ?? action.type,
        problem:
          `opens its modal at \`${width}\`, which is not a width — ` +
          `one of: ${MODAL_WIDTHS.join(", ")}`,
      });
    }
    // Only the one that is carried out collects anything. A link is followed by
    // the browser without asking the server anything, and a view opens on a
    // record rather than on a question — neither resolves the schema, and
    // neither draws it.
    if (action.state.form !== undefined && action.trigger !== "run") {
      complaints.push({
        field: action.state.label ?? action.type,
        problem:
          action.trigger === "link"
            ? "collects a form but only navigates, so nothing would open it"
            : "collects a form but only shows a record, so nothing would open it",
      });
    }
  }

  // The groups themselves, which the flattening above throws away.
  //
  // A group is the only action carrying a mark — an `Action` has no `icon` at
  // all — and `everyAction` exists to open groups out so the questions above
  // are asked of what actually runs. That is right for those questions and it
  // is why this one was never asked of anything: the only thing that could
  // answer it was the one thing being discarded.
  for (const group of [
    ...table.state.actions,
    ...table.state.headerActions,
    ...table.state.bulkActions,
  ].filter((one): one is ActionGroup => one instanceof ActionGroup)) {
    complaints.push(...refuseIcon(group.state.icon, group.state.label));
  }

  return complaints;
}

/** One message for the whole form: a boot failure is read once, in full. */
export function describeComplaints(
  subject: string,
  complaints: readonly Complaint[],
): string {
  const lines = complaints.map(({ field, problem }) => `  - \`${field}\` ${problem}`);
  return `${subject} declares a form that cannot work:\n${lines.join("\n")}`;
}

/**
 * Attributes on a cell, held to the same rule a control's are.
 *
 * The same regular expression, asked of the same names, so an attribute
 * allowed on a control and refused on a cell cannot come about by two lists
 * drifting apart. A cell takes what describes it; the rest of that namespace
 * tells a browser to do something, and a table is not the place to be told.
 */
/**
 * A computed column asking the database for something it does not have.
 *
 * Ordering and searching happen in the query, and the query knows only the
 * columns the model has. A value worked out in this process is not one of
 * them, so the adapter would raise with nothing in the panel to say why.
 * Refused where it is declared instead.
 */
function inspectComputed(column: Column, into: Complaint[]): void {
  if (column.state.value === undefined) return;

  if (column.state.path.includes(".")) {
    into.push({
      field: column.state.path,
      problem:
        "works its value out and is named by a path through a relation, so " +
        "there is nowhere to put what it returns: a computed column owns the " +
        "name it is read by",
    });
  }

  if (column instanceof WritableColumn) {
    into.push({
      field: column.state.path,
      problem:
        "offers a control in the table and works its own value out, so a write " +
        "through it is a write nobody sees: the save lands and the cell draws " +
        "what the resolver says again",
    });
  }

  const asked = (["sortable", "searchable"] as const).filter(
    (one) => column.state[one],
  );
  if (asked.length > 0) {
    into.push({
      field: column.state.path,
      problem:
        `works its value out and is \`${asked.join("`, `")}\`, which happens in ` +
        "the query, and the query has only the columns the model has, so it " +
        "would be asked to order by something that is not there",
    });
  }
}
function inspectCellAttributes(column: Column, into: Complaint[]): void {
  const extra = column.state.extraAttributes;
  if (extra === undefined) return;

  for (const name of Object.keys(extra)) {
    if (CELL_BINDINGS.has(name)) {
      into.push({
        field: column.state.path,
        problem:
          `puts \`${name}\` on its cells, which is what the table already says ` +
          "there — `data-label` is how a row becomes a stack on a narrow screen, " +
          "and a column that overwrites it is unlabelled exactly where the label " +
          "is all there is",
      });
      continue;
    }
    if (DESCRIBING.test(name)) continue;
    into.push({
      field: column.state.path,
      problem:
        `puts \`${name}\` on its cells, and a cell takes only attributes that ` +
        "describe it — `data-*`, `aria-*`, `title`, `role`. The rest of that " +
        "namespace tells a browser to do something",
    });
  }
}
