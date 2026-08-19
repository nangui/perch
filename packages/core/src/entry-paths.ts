/**
 * What an infolist reads, gathered for the loading plan and for the boot.
 *
 * Its own module because it has to know about both `Entry` and the one entry
 * that holds others, and those two cannot import each other.
 */
import type { Component } from "./component.js";
import { Entry } from "./entry.js";
import { RepeatableEntry } from "./entries/repeatable-entry.js";

/**
 * Every record path an infolist reads at one level, deduplicated.
 *
 * What `columnPaths` is to a table, and for the same two jobs: the loading plan
 * is built from these, so a relation an entry names costs one `include` rather
 * than a query, and the boot checks each of them against the IR.
 *
 * It stops at a `RepeatableEntry`. The paths inside one are read against a row
 * of that relation, not against the record — checking them here would resolve
 * `body` against the wrong model and refuse a form that is right.
 */
export function entryPaths(root: Component): readonly string[] {
  const paths: string[] = [];
  const walk = (component: Component): void => {
    if (component instanceof RepeatableEntry) return;
    if (component instanceof Entry && component.recordPath !== "") {
      paths.push(component.recordPath);
    }
    for (const child of component.children) walk(child);
  };
  walk(root);
  return [...new Set(paths)];
}

/**
 * The to-many relations an infolist reads, with what each of them reads.
 *
 * Separate from `entryPaths` because a to-many cannot be part of a path — the
 * resolver refuses one in the middle, and it is right to: `notes.body` on a
 * row-per-note relation is not one column, it is one per row.
 */
export function entryRelations(
  root: Component,
): readonly { readonly relation: string; readonly paths: readonly string[] }[] {
  const found: { relation: string; paths: readonly string[] }[] = [];
  const walk = (component: Component): void => {
    if (component instanceof RepeatableEntry) {
      if (component.recordPath !== "") {
        // From its children: `entryPaths` stops at a repeatable entry, and the
        // one asking is the one it stops at.
        found.push({
          relation: component.recordPath,
          paths: component.children.flatMap((child) => entryPaths(child)),
        });
      }
      return;
    }
    for (const child of component.children) walk(child);
  };
  walk(root);
  return found;
}
