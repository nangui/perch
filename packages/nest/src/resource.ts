/**
 * The decorator carries the resource's metadata and makes the class
 * `@Injectable`: instantiating through the container is what lets a resolver
 * inject a business service and call `this.cities.byCountry(…)`.
 */
import type { IconName, Row, Schema, Table, WriteTree } from "@perchjs/core";
import { defaultSlug, plural } from "@perchjs/core";
import type { Authorization } from "./authorization.js";
import type { RelationManager } from "./relation-manager.js";
import type { RedirectAfterCreate } from "./redirect.js";
import type { PanelResourcePage } from "./resource-page.js";
import { Injectable, SetMetadata } from "@nestjs/common";

export const PANEL_RESOURCE = Symbol("PERCH_PANEL_RESOURCE");

export interface PanelResourceOptions {
  /** The Prisma model this resource edits. */
  readonly model: string;
  /** URL segment. Defaults to the kebab-case plural of the model. */
  readonly slug?: string;
  readonly label?: string;
  readonly pluralLabel?: string;
  readonly navigationGroup?: string;
  readonly navigationSort?: number;
  readonly icon?: IconName;
  /**
   * Pages about one record, beside the ones the panel generates.
   *
   * Declared here rather than returned by a method, because the container has
   * to be told about them before it builds anything: a page that cannot be
   * injected is a page that cannot reach the service it was written for.
   */
  readonly pages?: readonly ResourcePageClass[];
}

/** A class carrying `@PanelResourcePage`. */
export type ResourcePageClass = new (...args: never[]) => PanelResourcePage;

/** What the registry holds once the defaults are filled in. */
export interface ResourceMetadata {
  readonly model: string;
  readonly slug: string;
  readonly label: string;
  readonly pluralLabel: string;
  readonly navigationGroup?: string;
  readonly navigationSort?: number;
  readonly icon?: IconName;
  readonly pages: readonly ResourcePageClass[];
}

/** One `form()` serves Create and Edit, told apart by `operation`. */
export interface PanelResource {
  form: () => Schema;
  /**
   * The table `/records` answers with. Optional: a resource without one still
   * lists, with no columns and the narrow default sort of `records-query.ts`.
   */
  table?: () => Table;
  /**
   * What the View page reads. Optional, and its absence is what decides there
   * is no View page: a resource with nothing to show read-only answers 404
   * there, like one that does not exist.
   */
  infolist?: () => Schema;
  /**
   * Children managed beside a record rather than inside its form.
   *
   * A repeater writes its rows with the parent, in one transaction; these work
   * one operation at a time, with their own pages and their own actions.
   */
  relations?: () => readonly RelationManager[];
  /**
   * A count beside the resource's name in the menu.
   *
   * A method and not a metadata field, because what a badge says is a number
   * that changed since the page was drawn — how many are pending, how many are
   * mine. It is handed the principal for the same reason the policy is: a count
   * of rows this reader may not see is a fact about them, one digit at a time.
   *
   * Answering `undefined` is answering nothing, and draws nothing. A resource
   * this reader cannot reach is never asked at all.
   */
  navigationBadge?: (user: unknown) => string | undefined | Promise<string | undefined>;
  /** Absent means allowed: the panel already sits behind the guards. */
  can?: Authorization;
  /** Overrides the panel's own choice for this resource alone. */
  redirectAfterCreate?: RedirectAfterCreate;
  /** Last chance to shape what is written — hashing a password, say. */
  mutateFormDataBeforeCreate?: (
    data: Record<string, unknown>,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /**
   * The same, for a save — and it does not always receive the whole form.
   *
   * A cell written from the table is a save of one field, so this is handed the
   * one key that was written. Adding to what arrives is safe; reading a field
   * that was not sent is not, and a hook that needs the whole row should read
   * it rather than expect it here.
   */
  mutateFormDataBeforeSave?: (
    data: Record<string, unknown>,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /**
   * The other direction: the row as read, before the Edit form opens on it.
   *
   * The pair to the two above, and the one that runs the other way. They are
   * the last thing to touch what is written; this is the first thing to touch
   * what is shown, which is where a stored shape and an edited shape stop
   * agreeing. A column holding minutes and a field asking for hours is the
   * ordinary case, and doing that conversion in the form's `default` would put
   * it somewhere that never sees an existing row.
   *
   * What it returns fills the form. The record itself is untouched, so the
   * policies, the relation managers and everything else asking about this row
   * go on seeing what the database holds.
   *
   * It cannot be used to send something to the browser that the form does not
   * carry: only the paths the tree makes visible are serialised, so a key
   * added here for any other purpose is dropped before the page is written.
   */
  /**
   * Writes the row instead of the panel, and answers with what was written.
   *
   * The escape hatch. An application with domain logic writes through a
   * service or an event bus, and a panel that can only reach into its tables
   * is a panel it cannot use. What arrives is the write the form produced:
   * `set` for the columns, `relations` for what rides with them, which is
   * where a repeater's rows are.
   *
   * What it answers with becomes the row. It has to carry the model's key,
   * because the panel names the row by it and a create goes to it, and it is
   * refused outright if it does not: the alternative is a save that answers
   * with nothing and a reader left on a form that has already been used.
   *
   * Nothing wraps it in a transaction. The framework's own write is wrapped
   * because a row and its repeater's rows are one write; what replaces it may
   * not be a database at all, and promising atomicity over it would be
   * promising something nothing here can keep.
   */
  handleRecordCreation?: (data: WriteTree) => Row | Promise<Row>;
  /**
   * The same for a save, handed the row as it stands as well as the write.
   *
   * It answers for every save, including a cell written from a table: a hook
   * honoured on one route and not the other writes to a database the
   * application said it does not use, on whichever route was forgotten.
   */
  handleRecordUpdate?: (record: Row, data: WriteTree) => Row | Promise<Row>;
  mutateFormDataBeforeFill?: (
    data: Record<string, unknown>,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
}

export function PanelResource(options: PanelResourceOptions): ClassDecorator {
  const metadata = withDefaults(options);
  return (target) => {
    Injectable()(
      target as unknown as Parameters<ClassDecorator>[0] & (new () => unknown),
    );
    SetMetadata(PANEL_RESOURCE, metadata)(target);
  };
}

export function resourceMetadata(target: unknown): ResourceMetadata | undefined {
  if (typeof target !== "function") return undefined;
  return Reflect.getMetadata(PANEL_RESOURCE, target) as ResourceMetadata | undefined;
}

function withDefaults(options: PanelResourceOptions): ResourceMetadata {
  const label = options.label ?? spaced(options.model);
  return {
    model: options.model,
    slug: options.slug ?? defaultSlug(options.model),
    label,
    pluralLabel: options.pluralLabel ?? plural(label),
    ...(options.navigationGroup === undefined
      ? {}
      : { navigationGroup: options.navigationGroup }),
    ...(options.navigationSort === undefined
      ? {}
      : { navigationSort: options.navigationSort }),
    ...(options.icon === undefined ? {} : { icon: options.icon }),
    pages: options.pages ?? [],
  };
}

/** `OrderLine` → `Order Line`, which is what a human reads on a page. */
function spaced(word: string): string {
  return word.replace(/([a-z\d])([A-Z])/g, "$1 $2");
}
