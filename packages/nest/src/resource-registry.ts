/**
 * Slug → resource.
 *
 * The metadata is read at bootstrap, so a missing decorator or two resources on
 * one URL stop the boot. The instances are not: asking the container for them
 * from this constructor would depend on the order it happens to build providers
 * in, and this class declares no dependency on any of them.
 *
 * The schema tree is never cached with an instance either. It is rebuilt per
 * request, because a builder shared between requests leaks one user's state into
 * another's.
 */
import type { OnModuleInit } from "@nestjs/common";
import { Inject, Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import type { Component, EntryRelation, Ir } from "@perchjs/core";
import type { DataAdapter, Schema, Table } from "@perchjs/core";
import {
  auditInfolist,
  auditSchema,
  auditTable,
  columnPaths,
  entryPaths,
  entryRelations,
  TernaryFilter,
  TrashedFilter,
  describeComplaints,
  findModel,
  FileUpload,
  resolvePath,
} from "@perchjs/core";
import type { PanelResource, ResourceMetadata } from "./resource.js";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import type { SchemaHook } from "./schema-hook.js";
import { PANEL_SCHEMA_HOOKS } from "./schema-hook.js";
import type { PanelDisks } from "./storage.token.js";
import { PANEL_STORAGE } from "./storage.token.js";
import { resourceMetadata } from "./resource.js";

export const PANEL_RESOURCE_TYPES = Symbol("PERCH_PANEL_RESOURCE_TYPES");

/** Segments the panel already routes under its own path. */
const RESERVED_SLUGS = new Set(["assets", "api"]);

export type ResourceClass = new (...args: never[]) => PanelResource;

export interface RegisteredResource {
  readonly metadata: ResourceMetadata;
  readonly instance: PanelResource;
}

@Injectable()
export class ResourceRegistry implements OnModuleInit {
  readonly #bySlug = new Map<
    string,
    { metadata: ResourceMetadata; type: ResourceClass }
  >();
  readonly #moduleRef: ModuleRef;
  readonly #disks: PanelDisks;
  readonly #data: DataAdapter | null;
  readonly #hooks: readonly SchemaHook[];

  constructor(
    @Inject(PANEL_RESOURCE_TYPES) types: readonly ResourceClass[],
    moduleRef: ModuleRef,
    @Inject(PANEL_STORAGE) disks: PanelDisks,
    @Inject(PANEL_DATA_ADAPTER) data: DataAdapter | null,
    @Inject(PANEL_SCHEMA_HOOKS) hooks: readonly SchemaHook[],
  ) {
    this.#moduleRef = moduleRef;
    this.#disks = disks;
    this.#data = data;
    this.#hooks = hooks;

    for (const type of types) {
      const metadata = resourceMetadata(type);
      if (metadata === undefined) {
        throw new Error(
          `${type.name} is listed in resources but carries no @PanelResource.`,
        );
      }

      if (RESERVED_SLUGS.has(metadata.slug)) {
        // It would mount under the panel's own routes and lose, silently.
        throw new Error(
          `${type.name} claims the slug "${metadata.slug}", which the panel already ` +
            `serves. Give it an explicit slug.`,
        );
      }

      const clash = this.#bySlug.get(metadata.slug);
      if (clash !== undefined) {
        // Two resources on one URL: whichever wins, the other is unreachable
        // and nothing would say why.
        throw new Error(
          `${type.name} and ${clash.type.name} both claim the slug "${metadata.slug}". ` +
            `Give one of them an explicit slug.`,
        );
      }

      this.#bySlug.set(metadata.slug, { metadata, type });
    }
  }

  /**
   * The form a resource shows, with everything that extends it.
   *
   * One place, because eight routes read a form and a field that one of them
   * knows about and another does not is a field that shows and will not save.
   *
   * Evaluated on each call, like `form()` itself. A route needing the same
   * form twice reads it once and carries it, rather than asking twice and
   * hoping somebody else's function answers the same thing both times.
   */
  formFor(resource: RegisteredResource): Schema {
    return this.#hooks.reduce(
      (schema, extend) => extend(resource.metadata, schema),
      resource.instance.form(),
    );
  }

  /**
   * What the View page reads, or nothing where the resource declares none.
   *
   * The extension hooks are not applied. They were written for the form, and
   * whether a module that adds a column to one should also add it to the other
   * is a decision nobody has taken — taking it here by spreading a reduce would
   * be taking it silently.
   */
  infolistFor(resource: RegisteredResource): Schema | undefined {
    return resource.instance.infolist?.();
  }

  /**
   * Every form is read once, here, and a form that cannot work stops the boot.
   *
   * Not in the constructor: the instances come from the container, and asking
   * for them before it has finished building would depend on the order it
   * happens to build providers in.
   *
   * Loud, and at boot, because these are lines of somebody's own form rather
   * than anything a client sent. A field that promises what it cannot do
   * otherwise fails at the one moment nobody is watching for it — under a
   * reader, in production, with no error at all.
   */
  onModuleInit(): void {
    for (const registered of this.all()) {
      const { metadata, instance } = registered;
      const table = instance.table?.();
      // Audited as it will be served: a field a hook adds is somebody's code
      // too, and one that cannot work should stop this boot rather than the
      // first reader.
      const form = this.formFor(registered);
      const infolist = this.infolistFor(registered);
      const complaints = [
        ...auditSchema(form),
        ...(infolist === undefined ? [] : auditInfolist(infolist)),
        ...(table === undefined ? [] : auditTable(table)),
        ...this.#unknownDisks(form),
        ...(table === undefined ? [] : this.#unreachableColumns(metadata.model, table)),
        ...(table === undefined ? [] : this.#unmarkableTable(metadata.model, table)),
        ...(table === undefined ? [] : this.#unaskableFilters(metadata.model, table)),
        ...(infolist === undefined
          ? []
          : this.#unreadablePaths(metadata.model, entryPaths(infolist), "entry")),
        ...(infolist === undefined
          ? []
          : this.#unreadableRows(metadata.model, infolist)),
      ];
      if (complaints.length > 0) {
        throw new Error(describeComplaints(`Resource "${metadata.slug}"`, complaints));
      }
    }
  }

  /**
   * Columns reading a path the model does not have.
   *
   * Not `auditTable`'s to catch: the IR is the adapter's and the domain has
   * never heard of it. A typo here is a column that renders blank on every row
   * for as long as nobody looks closely — and, since the loading plan is built
   * from these paths, a relation that silently never loads.
   */
  /**
   * A trashed filter on a model with nothing to mark.
   *
   * Three states that all mean the same page: the control offers a question the
   * table cannot answer, and answering it with the ordinary rows is worse than
   * refusing the form.
   */
  #unmarkableTable(
    model: string,
    table: Table,
  ): readonly { field: string; problem: string }[] {
    if (this.#data === null) return [];
    if (findModel(this.#data.ir(), model)?.hasSoftDelete === true) return [];

    return table.state.filters
      .filter((filter) => filter instanceof TrashedFilter)
      .map((filter) => ({
        field: filter.state.name,
        problem:
          `filters deleted rows on \`${model}\`, which has no deletion column — ` +
          "every one of its three states shows the same page",
      }));
  }

  /**
   * A ternary filter on a column that does not hold one of two answers.
   *
   * `equals true` against a `String` matches nothing, on every row, for ever —
   * an empty table that reads as a table with nothing in it.
   */
  #unaskableFilters(
    model: string,
    table: Table,
  ): readonly { field: string; problem: string }[] {
    if (this.#data === null) return [];
    const ir = this.#data.ir();
    if (findModel(ir, model) === undefined) return [];

    return table.state.filters.flatMap((filter) => {
      if (!(filter instanceof TernaryFilter)) return [];
      let type: string | undefined;
      try {
        type = resolvePath(ir, model, filter.state.path).field.type;
      } catch {
        // A path that does not resolve is `#unreadablePaths`' complaint, and
        // saying it twice helps nobody.
        return [];
      }
      if (type === "Boolean") return [];
      return [
        {
          field: filter.state.name,
          problem:
            `asks yes or no of \`${filter.state.path}\`, which is a \`${type}\` — ` +
            "the comparison matches nothing, on every row",
        },
      ];
    });
  }

  #unreachableColumns(
    model: string,
    table: Table,
  ): readonly { field: string; problem: string }[] {
    return this.#unreadablePaths(model, columnPaths(table), "column");
  }

  /**
   * A repeatable entry naming something that is not a to-many relation, and the
   * paths its rows read judged against the row's own model.
   *
   * Two mistakes with the same look on screen — an empty section — and neither
   * reported by anything: a relation the model does not have, and a column that
   * is on the record rather than on one of its rows.
   */
  #unreadableRows(
    model: string,
    infolist: Schema,
  ): readonly { field: string; problem: string }[] {
    if (this.#data === null) return [];
    return this.#rowsUnder(this.#data.ir(), model, entryRelations(infolist));
  }

  /** One level of rows, then the rows those rows hold. */
  #rowsUnder(
    ir: Ir,
    model: string,
    relations: readonly EntryRelation[],
  ): readonly { field: string; problem: string }[] {
    const owner = findModel(ir, model);
    if (owner === undefined) return [];

    return relations.flatMap((entry) => {
      const found = owner.relations.find((one) => one.name === entry.relation);
      if (found === undefined || !found.isList) {
        return [
          {
            field: entry.relation,
            problem:
              `is a repeatable entry on \`${model}\`, which has no to-many ` +
              `relation by that name — it reads rows, so it needs one`,
          },
        ];
      }
      return [
        ...this.#unreadablePaths(found.targetModel, entry.paths, "entry"),
        ...this.#rowsUnder(ir, found.targetModel, entry.relations),
      ];
    });
  }

  /** Shared, because a column and an entry speak the same path language. */
  #unreadablePaths(
    model: string,
    paths: readonly string[],
    what: string,
  ): readonly { field: string; problem: string }[] {
    if (this.#data === null) return [];
    const ir = this.#data.ir();

    // A model the IR does not carry is one problem, not one per path, and it is
    // not this check's. The read path tolerates it the same way: `allowed`
    // answers with an empty set rather than complaining about every path.
    if (findModel(ir, model) === undefined) return [];

    return paths.flatMap((path) => {
      try {
        resolvePath(ir, model, path);
        return [];
      } catch (error) {
        return [
          {
            field: path,
            problem: `is ${what === "entry" ? "an" : "a"} ${what} on \`${model}\` that reads nothing: ${
              error instanceof Error ? error.message : "the path does not resolve"
            }`,
          },
        ];
      }
    });
  }

  /**
   * Uploads pointed at a disk nobody provided.
   *
   * Not `auditSchema`'s to catch: which disks exist is the host's arrangement
   * and `@perchjs/core` has never heard of it. The complaint reads the same
   * either way, which is the point — a field that cannot work stops the boot
   * wherever the reason for it happens to live.
   */
  #unknownDisks(form: Component): readonly { field: string; problem: string }[] {
    const uploads = flatten(form).filter(
      (component): component is FileUpload => component instanceof FileUpload,
    );

    return uploads
      .filter((upload) => !(upload.state.disk in this.#disks))
      .map((upload) => ({
        field: upload.name === "" ? "an unnamed FileUpload" : upload.name,
        problem:
          `names the disk \`${upload.state.disk}\`, which the panel was not given — ` +
          `it has ${describeDisks(this.#disks)}`,
      }));
  }

  get(slug: string): RegisteredResource | undefined {
    const registered = this.#bySlug.get(slug);
    return registered === undefined ? undefined : this.#resolve(registered);
  }

  all(): readonly RegisteredResource[] {
    return [...this.#bySlug.values()].map((registered) => this.#resolve(registered));
  }

  #resolve(registered: {
    metadata: ResourceMetadata;
    type: ResourceClass;
  }): RegisteredResource {
    return {
      metadata: registered.metadata,
      instance: this.#moduleRef.get<PanelResource>(registered.type, { strict: false }),
    };
  }
}

function flatten(component: Component): readonly Component[] {
  return [component, ...component.children.flatMap(flatten)];
}

/** Named rather than counted: the usual mistake is a typo, and a name shows it. */
function describeDisks(disks: PanelDisks): string {
  const names = Object.keys(disks);
  if (names.length === 0) return "none at all";
  return names.map((name) => `\`${name}\``).join(", ");
}
