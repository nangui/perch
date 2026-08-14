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
import { Field } from "./field.js";
import { Hidden } from "./fields/hidden.js";
import { DateTimePicker } from "./fields/date-time-picker.js";
import { FileUpload } from "./fields/file-upload.js";
import { Radio } from "./fields/radio.js";
import { Select } from "./fields/select.js";
import { SelectFilter } from "./filter.js";
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
  for (const child of component.children) walk(child, into);
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
  for (const filter of table.state.filters) {
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
  for (const action of [...table.state.actions, ...table.state.headerActions]) {
    if (action.state.run === undefined && !action.isBuiltIn) {
      complaints.push({
        field: action.state.label ?? action.type,
        problem: "has no `action()`, so pressing it would do nothing at all",
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
