/**
 * A page about one record, beside the ones the panel generates.
 *
 * A record has a form and, where the resource says so, a read-only view. A
 * resource page is a third kind: statistics for this order, the audit trail of
 * this post, a screen that does one thing to one row. It lives under the
 * record's own address and is reached from the record, not from the menu —
 * a page about one row is not a place a reader navigates to cold.
 *
 * `schema()` takes no record, for the reason a resource's `form()` takes none:
 * the tree is the same shape for every row and the row is what fills it. That
 * is also what lets the boot read it. A schema built around a record could
 * only be read once a record existed, which is to say under a reader, in
 * production, with no error at all.
 */
import type { FormState, IconName, Row, Schema } from "@perchjs/core";
import type { Authorization } from "./authorization.js";
import { Injectable, SetMetadata } from "@nestjs/common";

export const PANEL_RESOURCE_PAGE = Symbol("PERCH_PANEL_RESOURCE_PAGE");

export interface PanelResourcePageOptions {
  /** The segment under the record: `{path}/posts/1/{path}`. */
  readonly path: string;
  /** What the strip on the record calls it. The path, titled, unless told. */
  readonly label?: string;
  readonly icon?: IconName;
  /** Where it sits among the record's pages. The declaration order otherwise. */
  readonly sort?: number;
}

export interface ResourcePageMetadata {
  readonly path: string;
  readonly label: string;
  readonly icon?: IconName;
  readonly sort?: number;
}

export interface PanelResourcePage {
  /** The tree it draws. The same shape for every row, like a resource's form. */
  schema: () => Schema;
  /**
   * What the form starts with, read off the row.
   *
   * Absent means the row itself, which is what a form does — a page showing
   * fields named after columns shows what those columns hold.
   */
  state?: (record: Row) => FormState | Promise<FormState>;
  /**
   * What pressing save does to this row.
   *
   * Absent means a page that shows and does not submit, and the panel refuses
   * a save against it rather than answering yes and writing nothing.
   */
  submit?: (record: Row, state: FormState) => unknown;
  /**
   * A further gate, on top of the resource's own.
   *
   * The resource's `view` is asked first and about this record, so this is for
   * a page that is narrower than the record it belongs to — an audit trail
   * only an administrator reads. Only `viewAny` is consulted: the record
   * question has already been asked and answered.
   */
  can?: Pick<Authorization, "viewAny">;
}

export function PanelResourcePage(options: PanelResourcePageOptions): ClassDecorator {
  const metadata = withDefaults(options);
  return (target) => {
    Injectable()(
      target as unknown as Parameters<ClassDecorator>[0] & (new () => unknown),
    );
    SetMetadata(PANEL_RESOURCE_PAGE, metadata)(target);
  };
}

export function resourcePageMetadata(
  target: unknown,
): ResourcePageMetadata | undefined {
  if (typeof target !== "function") return undefined;
  return Reflect.getMetadata(PANEL_RESOURCE_PAGE, target) as
    ResourcePageMetadata | undefined;
}

function withDefaults(options: PanelResourcePageOptions): ResourcePageMetadata {
  return {
    path: options.path,
    label: options.label ?? titled(options.path),
    ...(options.icon === undefined ? {} : { icon: options.icon }),
    ...(options.sort === undefined ? {} : { sort: options.sort }),
  };
}

/** `audit-trail` → `Audit trail`, which is what a strip of links reads. */
function titled(path: string): string {
  const words = path.replaceAll("-", " ").trim();
  return words === "" ? path : words.charAt(0).toUpperCase() + words.slice(1);
}
