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
import { Radio } from "./fields/radio.js";
import { Select } from "./fields/select.js";
import { SelectFilter } from "./filter.js";
import type { Table } from "./table.js";
import { declaredFilters } from "./table.js";

export interface Complaint {
  /** The field's name, or its position when it has none. */
  readonly field: string;
  readonly problem: string;
}

export function auditSchema(root: Component): readonly Complaint[] {
  const complaints: Complaint[] = [];
  walk(root, complaints);
  return complaints;
}

function walk(component: Component, into: Complaint[]): void {
  if (component instanceof Select) inspectSelect(component, into);
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
  // Two filters under one name is already refused — but on the first list
  // request, under a reader. Asking here brings it forward to the boot.
  declaredFilters(table);

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
