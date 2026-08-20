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
import type { Component } from "./component.js";
import { Entry } from "./entry.js";
import { TextEntry } from "./entries/text-entry.js";
import { Field } from "./field.js";
import { Tab, Tabs } from "./layout.js";
import { Hidden } from "./fields/hidden.js";
import { DateTimePicker } from "./fields/date-time-picker.js";
import { FileUpload } from "./fields/file-upload.js";
import { Radio } from "./fields/radio.js";
import { Repeater } from "./fields/repeater.js";
import { Select } from "./fields/select.js";
import { TextInput } from "./fields/text-input.js";
import { SelectFilter, TrashedFilter } from "./filter.js";
import type { Table } from "./table.js";
import { declaredActions, declaredFilters } from "./table.js";
import { isWallClock } from "./zoned.js";

export interface Complaint {
  /** The field's name, or its position when it has none. */
  readonly field: string;
  readonly problem: string;
}

export function auditSchema(root: Component): readonly Complaint[] {
  const complaints: Complaint[] = [];
  walk(root, complaints);

  // A hook may `set()` any path at all, and what it sets is opaque from here.
  // So the hidden-field complaint below is only made where nothing in the form
  // could possibly be filling one: certain, rather than probable. A boot that
  // stops a working form is worse than one that misses a broken one.
  if (!anyHook(root)) {
    for (const field of hiddenFields(root)) {
      if (field.state.defaultValue !== undefined) continue;
      complaints.push({
        field: field.name === "" ? "an unnamed Hidden" : field.name,
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
        field: component.name === "" ? `an unnamed ${component.type}` : component.name,
        problem:
          "is a field in an infolist, so it would draw a control on a page " +
          "with nothing to save it — an entry is what shows a value",
      });
      return;
    }
    if (component instanceof TextEntry) inspectLimit(component, complaints);
    for (const child of component.children) walk(child);
  };
  walk(root);
  return complaints;
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

  const name = entry.name;
  into.push({
    field: name === undefined || name === "" ? "an unnamed TextEntry" : name,
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
    field: input.name === "" ? "an unnamed TextInput" : input.name,
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
  if (component instanceof Select) inspectSelect(component, into);
  if (component instanceof DateTimePicker) inspectDates(component, into);
  // A step of zero divides; a negative one has no meaning. Either way the rule
  // it implies would answer `true` to everything, which is a limit that reads
  // as declared and refuses nothing.
  if (component instanceof TextInput) inspectStep(component, into);
  // A media type nothing can match is a filter that refuses everything, and a
  // reader whose file is turned away is told only that it was.
  if (component instanceof FileUpload) inspectUpload(component, into);
  // Every choice is on the page, so there is no relation and no window to
  // excuse an empty list: the boundary would refuse every value a reader picks.
  if (component instanceof Radio && component.state.options === undefined) {
    into.push({
      field: component.name === "" ? "an unnamed Radio" : component.name,
      problem: "has no options, so it offers nothing and would refuse anything",
    });
  }
  // A set of panels with no panels draws nothing at all, and a panel that is
  // not one is drawn as a tab named after whatever it is, opening on an empty
  // box. Both read on screen as a layout that failed rather than as a form.
  if (component instanceof Tabs) {
    const name = component.name === "" ? "an unnamed Tabs" : component.name;
    if (component.children.length === 0) {
      into.push({
        field: name ?? "an unnamed Tabs",
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
      field: component.name === "" ? "an unnamed Repeater" : component.name,
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
  const name = picker.name === "" ? "an unnamed DateTimePicker" : picker.name;
  const { withTime, minDate, maxDate } = picker.state;
  const wanted = withTime ? "YYYY-MM-DDTHH:mm" : "YYYY-MM-DD";

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

function inspectUpload(upload: FileUpload, into: Complaint[]): void {
  const name = upload.name === "" ? "an unnamed FileUpload" : upload.name;
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
  const name = select.name === "" ? "an unnamed Select" : select.name;
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
}

/**
 * The same reading, for the table half of a resource.
 *
 * A filter has the same way of going quiet as a field: declared, serialised,
 * and answering nothing. The renderer draws no control for a choice with
 * nothing to choose from, so without this the only sign is a filter that never
 * appears.
 */
export function auditTable(table: Table): readonly Complaint[] {
  // Two under one name is already refused — but on the first request that names
  // one, under a reader. Asking here brings it forward to the boot.
  declaredFilters(table);
  declaredActions(table);

  const complaints: Complaint[] = [];

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
  for (const action of [
    ...table.state.actions,
    ...table.state.headerActions,
    ...table.state.bulkActions,
  ]) {
    if (action.state.run === undefined && !action.isBuiltIn) {
      complaints.push({
        field: action.state.label ?? action.type,
        problem: "has no `action()`, so pressing it would do nothing at all",
      });
    }
    // A link is followed by the browser without asking the server anything, so
    // no route ever resolves the schema and no dialog ever shows it.
    if (action.state.form !== undefined && action.trigger === "link") {
      complaints.push({
        field: action.state.label ?? action.type,
        problem: "collects a form but only navigates, so nothing would open it",
      });
    }
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
